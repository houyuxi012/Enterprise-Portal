from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models

PRIVACY_POLICY_CONFIG_KEYS = {
    "privacy_policy",
    "privacy_policy_required",
    "privacy_policy_version",
}

HEADER_CONSENT_ACCEPTED = "X-Privacy-Consent-Accepted"
HEADER_POLICY_VERSION = "X-Privacy-Policy-Version"
HEADER_POLICY_HASH = "X-Privacy-Policy-Hash"
HEADER_CONSENT_LOCALE = "X-Privacy-Consent-Locale"

MFA_CLAIM_POLICY_VERSION = "privacy_policy_version"
MFA_CLAIM_POLICY_HASH = "privacy_policy_hash"
MFA_CLAIM_POLICY_LOCALE = "privacy_policy_locale"


@dataclass(frozen=True)
class PrivacyPolicySnapshot:
    text: str
    version: str
    policy_hash: str
    required: bool
    configured: bool


@dataclass(frozen=True)
class PendingPrivacyConsent:
    policy_version: str
    policy_hash: str
    locale: str | None = None


def _as_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    candidate = str(value).strip().lower()
    if candidate == "":
        return default
    return candidate in {"1", "true", "yes", "on", "enabled"}


def _build_privacy_error(
    *,
    status_code: int,
    code: str,
    message: str,
    snapshot: PrivacyPolicySnapshot,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message,
            "policy_version": snapshot.version,
            "policy_hash": snapshot.policy_hash,
        },
    )


async def load_privacy_policy_snapshot(db: AsyncSession) -> PrivacyPolicySnapshot:
    result = await db.execute(
        select(models.SystemConfig).where(models.SystemConfig.key.in_(PRIVACY_POLICY_CONFIG_KEYS))
    )
    config_map = {cfg.key: cfg.value for cfg in result.scalars().all()}
    policy_text = str(config_map.get("privacy_policy") or "")
    policy_version = str(config_map.get("privacy_policy_version") or "").strip() or "v1"
    policy_required = _as_bool(config_map.get("privacy_policy_required"), default=True)
    policy_configured = bool(policy_text.strip())
    policy_hash = hashlib.sha256(policy_text.encode("utf-8")).hexdigest()
    return PrivacyPolicySnapshot(
        text=policy_text,
        version=policy_version,
        policy_hash=policy_hash,
        required=policy_required,
        configured=policy_configured,
    )


async def load_public_privacy_config(db: AsyncSession) -> dict[str, str]:
    snapshot = await load_privacy_policy_snapshot(db)
    return {
        "privacy_policy_version": snapshot.version,
        "privacy_policy_hash": snapshot.policy_hash,
        "privacy_policy_required": "true" if snapshot.required else "false",
    }


async def get_current_consent(
    db: AsyncSession,
    *,
    user_id: int,
    audience: str,
    snapshot: PrivacyPolicySnapshot,
) -> models.PrivacyConsent | None:
    result = await db.execute(
        select(models.PrivacyConsent)
        .where(
            models.PrivacyConsent.user_id == user_id,
            models.PrivacyConsent.audience == audience,
            models.PrivacyConsent.policy_version == snapshot.version,
            models.PrivacyConsent.policy_hash == snapshot.policy_hash,
            models.PrivacyConsent.accepted.is_(True),
        )
        .order_by(desc(models.PrivacyConsent.accepted_at))
        .limit(1)
    )
    return result.scalars().first()


async def prepare_login_privacy_consent(
    *,
    db: AsyncSession,
    request: Request,
    user: models.User,
    audience: str,
) -> PendingPrivacyConsent | None:
    snapshot = await load_privacy_policy_snapshot(db)
    if not snapshot.required or not snapshot.configured:
        return None

    existing = await get_current_consent(
        db,
        user_id=user.id,
        audience=audience,
        snapshot=snapshot,
    )
    if existing is not None:
        return None

    consent_accepted = _as_bool(request.headers.get(HEADER_CONSENT_ACCEPTED), default=False)
    request_policy_version = str(request.headers.get(HEADER_POLICY_VERSION) or "").strip()
    request_policy_hash = str(request.headers.get(HEADER_POLICY_HASH) or "").strip()
    locale = str(request.headers.get(HEADER_CONSENT_LOCALE) or "").strip() or None

    if not consent_accepted:
        raise _build_privacy_error(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            code="PRIVACY_CONSENT_REQUIRED",
            message="请阅读并同意当前版本的隐私政策后再登录。",
            snapshot=snapshot,
        )

    if request_policy_version != snapshot.version or request_policy_hash != snapshot.policy_hash:
        raise _build_privacy_error(
            status_code=status.HTTP_409_CONFLICT,
            code="PRIVACY_POLICY_STALE",
            message="隐私政策已更新，请刷新页面后重新阅读并同意。",
            snapshot=snapshot,
        )

    return PendingPrivacyConsent(
        policy_version=snapshot.version,
        policy_hash=snapshot.policy_hash,
        locale=locale,
    )


async def persist_authenticated_privacy_consent(
    *,
    db: AsyncSession,
    request: Request,
    user: models.User,
    audience: str,
    consent: PendingPrivacyConsent | None,
) -> models.PrivacyConsent | None:
    if consent is None:
        return None

    snapshot = await load_privacy_policy_snapshot(db)
    if not snapshot.required or not snapshot.configured:
        return None

    if consent.policy_version != snapshot.version or consent.policy_hash != snapshot.policy_hash:
        raise _build_privacy_error(
            status_code=status.HTTP_409_CONFLICT,
            code="PRIVACY_POLICY_STALE",
            message="隐私政策已更新，请刷新页面后重新阅读并同意。",
            snapshot=snapshot,
        )

    existing = await get_current_consent(
        db,
        user_id=user.id,
        audience=audience,
        snapshot=snapshot,
    )
    if existing is not None:
        return existing

    record = models.PrivacyConsent(
        user_id=user.id,
        username=user.username,
        audience=audience,
        policy_version=snapshot.version,
        policy_hash=snapshot.policy_hash,
        accepted=True,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        locale=consent.locale,
        trace_id=request.headers.get("X-Request-ID"),
        accepted_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.flush()
    return record


def build_mfa_privacy_claims(consent: PendingPrivacyConsent | None) -> dict[str, str]:
    if consent is None:
        return {}
    claims = {
        MFA_CLAIM_POLICY_VERSION: consent.policy_version,
        MFA_CLAIM_POLICY_HASH: consent.policy_hash,
    }
    if consent.locale:
        claims[MFA_CLAIM_POLICY_LOCALE] = consent.locale
    return claims


async def consume_mfa_privacy_claims(
    *,
    db: AsyncSession,
    request: Request,
    user: models.User,
    audience: str,
    token_data: dict[str, Any],
) -> models.PrivacyConsent | None:
    snapshot = await load_privacy_policy_snapshot(db)
    if not snapshot.required or not snapshot.configured:
        return None

    existing = await get_current_consent(
        db,
        user_id=user.id,
        audience=audience,
        snapshot=snapshot,
    )
    if existing is not None:
        return existing

    policy_version = str(token_data.get(MFA_CLAIM_POLICY_VERSION) or "").strip()
    policy_hash = str(token_data.get(MFA_CLAIM_POLICY_HASH) or "").strip()
    locale = str(token_data.get(MFA_CLAIM_POLICY_LOCALE) or "").strip() or None

    if not policy_version or not policy_hash:
        raise _build_privacy_error(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            code="PRIVACY_CONSENT_REQUIRED",
            message="当前登录流程缺少隐私同意证明，请重新登录并重新确认隐私政策。",
            snapshot=snapshot,
        )

    return await persist_authenticated_privacy_consent(
        db=db,
        request=request,
        user=user,
        audience=audience,
        consent=PendingPrivacyConsent(
            policy_version=policy_version,
            policy_hash=policy_hash,
            locale=locale,
        ),
    )
