import hashlib
from datetime import datetime, timezone
from typing import Dict, Literal, Set

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from application.iam_app import LicenseService, generate_file_token, resolve_file_token, storage
import core.database as database
import modules.models as models

router = APIRouter(prefix="/public", tags=["public"])

# Public-safe configuration keys for pre-login screens and portal branding.
PUBLIC_CONFIG_KEYS: Set[str] = {
    "app_name",
    "logo_url",
    "footer_text",
    "browser_title",
    "favicon_url",
    "privacy_policy",
    "ai_name",
    "ai_icon",
    "ai_enabled",
    "search_ai_enabled",
    "kb_enabled",
    "default_ai_model",
}

# Config keys whose values may contain file tokens accessible without login.
_FILE_BEARING_CONFIG_KEYS: Set[str] = {"logo_url", "favicon_url", "ai_icon"}


class PrivacyConsentRequest(BaseModel):
    audience: Literal["portal", "admin"] = "portal"
    username: str | None = Field(default=None, max_length=255)
    locale: str | None = Field(default=None, max_length=16)
    accepted: bool = True


@router.get("/config", response_model=Dict[str, str])
async def get_public_config(
    db: AsyncSession = Depends(database.get_db),
):
    result = await db.execute(
        select(models.SystemConfig).where(models.SystemConfig.key.in_(PUBLIC_CONFIG_KEYS))
    )
    configs = result.scalars().all()
    payload = {c.key: c.value for c in configs}

    # Rewrite file proxy URLs to public (no-auth) path for login/branding screens
    _PUBLIC_FILE_PREFIX = "/api/files/"
    _PUBLIC_REWRITE_PREFIX = "/api/public/files/"
    for key in _FILE_BEARING_CONFIG_KEYS:
        val = payload.get(key, "")
        if val and val.startswith(_PUBLIC_FILE_PREFIX):
            payload[key] = _PUBLIC_REWRITE_PREFIX + val[len(_PUBLIC_FILE_PREFIX):]

    # Expose tenant/customer display name from current license for portal copy.
    state = await LicenseService.get_current_state(db)
    customer_name = str((state or {}).get("customer") or "").strip()
    if customer_name and customer_name != "-":
        payload["customer_name"] = customer_name

    return payload


@router.post("/privacy/consents")
async def record_privacy_consent(
    payload: PrivacyConsentRequest,
    request: Request,
    db: AsyncSession = Depends(database.get_db),
):
    if not payload.accepted:
        raise HTTPException(
            status_code=400,
            detail={"code": "CONSENT_REQUIRED", "message": "必须同意隐私政策后才能继续"},
        )

    result = await db.execute(
        select(models.SystemConfig).where(
            models.SystemConfig.key.in_(
                [
                    "privacy_policy",
                    "privacy_policy_version",
                    "privacy_policy_required",
                ]
            )
        )
    )
    config_map = {cfg.key: cfg.value for cfg in result.scalars().all()}

    policy_text = str(config_map.get("privacy_policy") or "")
    policy_version = str(config_map.get("privacy_policy_version") or "").strip() or "v1"
    policy_required = str(config_map.get("privacy_policy_required") or "true").strip().lower() == "true"
    policy_configured = bool(policy_text.strip())
    if policy_required and not policy_configured:
        # Keep login flow available even when policy text has not been configured yet.
        # We still persist auditable consent evidence with a deterministic placeholder hash.
        policy_text = "__PRIVACY_POLICY_NOT_CONFIGURED__"

    consent = models.PrivacyConsent(
        username=(payload.username or "").strip() or None,
        audience=payload.audience,
        policy_version=policy_version,
        policy_hash=hashlib.sha256(policy_text.encode("utf-8")).hexdigest(),
        accepted=True,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        locale=(payload.locale or "").strip() or None,
        trace_id=request.headers.get("X-Request-ID"),
        accepted_at=datetime.now(timezone.utc),
    )
    db.add(consent)
    await db.commit()
    await db.refresh(consent)

    return {
        "consent_id": consent.id,
        "audience": consent.audience,
        "policy_version": consent.policy_version,
        "policy_hash": consent.policy_hash,
        "policy_configured": policy_configured,
        "accepted_at": consent.accepted_at.isoformat() if consent.accepted_at else "",
    }





def _iter_stream(response, chunk_size: int = 64 * 1024):
    """Yield chunks then close the underlying connection."""
    try:
        while True:
            data = response.read(chunk_size)
            if not data:
                break
            yield data
    finally:
        response.close()
        response.release_conn()


@router.get("/files/{token}")
async def public_file_proxy(
    token: str,
    db: AsyncSession = Depends(database.get_db),
):
    """Serve a file **without authentication**, but ONLY if the token
    corresponds to a URL currently stored in one of the public-safe
    system_config keys (logo_url, favicon_url, ai_icon).

    This prevents abuse: an attacker cannot use this endpoint to
    download arbitrary uploaded files — only the few explicitly
    published by the admin for the login/branding screens.
    """
    # 1. Verify the HMAC token is structurally valid
    real_filename = resolve_file_token(token)
    if not real_filename:
        raise HTTPException(status_code=404, detail="File not found")

    # 2. Whitelist check: the exact proxy URL must be stored in system_config
    expected_token = generate_file_token(real_filename)
    expected_url = f"/api/files/{expected_token}"

    result = await db.execute(
        select(models.SystemConfig).where(
            models.SystemConfig.key.in_(_FILE_BEARING_CONFIG_KEYS)
        )
    )
    allowed_urls = {c.value for c in result.scalars().all() if c.value}

    if expected_url not in allowed_urls:
        raise HTTPException(status_code=404, detail="File not found")

    # 3. Stream the file
    stream, content_type, content_length = storage.get_object_stream(real_filename)
    if stream is None:
        raise HTTPException(status_code=404, detail="File not found in storage")

    headers: dict[str, str] = {}
    if content_length:
        headers["Content-Length"] = str(content_length)
    headers["Cache-Control"] = "public, max-age=3600, immutable"

    return StreamingResponse(
        _iter_stream(stream),
        media_type=content_type,
        headers=headers,
    )
