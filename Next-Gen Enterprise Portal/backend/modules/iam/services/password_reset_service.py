from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import modules.models as models
from iam.audit.service import IAMAuditService
from iam.identity.service import IdentityService, SessionStateStoreError
from infrastructure.cache_manager import CacheManager
from modules.admin.services.notification_templates import get_system_config_map
from modules.iam.services.password_reset_links import build_password_reset_link
from modules.iam.services.email_service import send_password_reset_email
from modules.iam.services.password_policy import set_user_password

logger = logging.getLogger("password_reset_service")

PASSWORD_RESET_TOKEN_TTL_MINUTES = 30
PASSWORD_RESET_REQUEST_INTERVAL_SECONDS = 60
PASSWORD_RESET_REQUEST_PREFIX = "iam:password_reset:last_request:"
GENERIC_RESET_REQUEST_MESSAGE = "如果账户存在且已绑定邮箱，重置链接已发送，请检查邮箱。"
SUPPORTED_AUDIENCES = {"admin", "portal"}


def _normalize_identifier(value: object | None) -> str:
    return str(value or "").strip().lower()


def _hash_reset_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _mask_email(email: str | None) -> str | None:
    value = str(email or "").strip()
    if not value or "@" not in value:
        return None
    local, domain = value.split("@", 1)
    if len(local) <= 2:
        masked_local = f"{local[:1]}***"
    else:
        masked_local = f"{local[:2]}***{local[-1:]}"
    return f"{masked_local}@{domain}"


def _raise_reset_error(code: str, message: str, status_code: int) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message,
        },
    )


async def _find_resettable_user(
    db: AsyncSession,
    *,
    identifier: str,
    audience: str,
) -> models.User | None:
    normalized_identifier = _normalize_identifier(identifier)
    if not normalized_identifier or audience not in SUPPORTED_AUDIENCES:
        return None

    stmt = (
        select(models.User)
        .options(
            selectinload(models.User.roles).selectinload(models.Role.permissions),
        )
        .where(
            or_(
                func.lower(models.User.username) == normalized_identifier,
                func.lower(models.User.email) == normalized_identifier,
            )
        )
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    if user is None:
        return None
    if not getattr(user, "is_active", False):
        return None
    if str(getattr(user, "auth_source", "local") or "local").lower() != "local":
        return None
    if not str(getattr(user, "email", "") or "").strip():
        return None

    can_login = (
        IdentityService._can_login_admin(user)
        if audience == "admin"
        else IdentityService._can_login_portal(user)
    )
    if not can_login:
        return None
    return user


async def _revoke_existing_reset_tokens(
    db: AsyncSession,
    *,
    user_id: int,
    audience: str,
    now: datetime,
) -> None:
    result = await db.execute(
        select(models.PasswordResetToken).where(
            models.PasswordResetToken.user_id == user_id,
            models.PasswordResetToken.audience == audience,
            models.PasswordResetToken.used_at.is_(None),
            models.PasswordResetToken.revoked_at.is_(None),
        )
    )
    for token in result.scalars().all():
        token.revoked_at = now
        db.add(token)


async def request_password_reset(
    db: AsyncSession,
    *,
    request: Request,
    identifier: str,
    audience: str,
    locale: str | None = None,
) -> dict[str, str]:
    normalized_identifier = _normalize_identifier(identifier)
    if not normalized_identifier:
        _raise_reset_error(
            "PASSWORD_RESET_IDENTIFIER_REQUIRED",
            "请输入企业邮箱或企业账号。",
            status.HTTP_400_BAD_REQUEST,
        )
    if audience not in SUPPORTED_AUDIENCES:
        _raise_reset_error(
            "PASSWORD_RESET_AUDIENCE_INVALID",
            "密码重置请求场景无效。",
            status.HTTP_400_BAD_REQUEST,
        )

    cache = CacheManager()
    throttle_key = f"{PASSWORD_RESET_REQUEST_PREFIX}{audience}:{normalized_identifier}"
    if await cache.get(throttle_key) is not None:
        return {"message": GENERIC_RESET_REQUEST_MESSAGE}
    await cache.set(throttle_key, "1", ttl=PASSWORD_RESET_REQUEST_INTERVAL_SECONDS)

    user = await _find_resettable_user(db, identifier=normalized_identifier, audience=audience)
    if user is None:
        return {"message": GENERIC_RESET_REQUEST_MESSAGE}
    user_id = int(getattr(user, "id"))
    username = str(getattr(user, "username", "") or "")
    display_name = str(getattr(user, "name", None) or username)
    user_locale = getattr(user, "locale", None)
    user_email = str(getattr(user, "email", "") or "")

    now = datetime.now(timezone.utc)
    plain_token = secrets.token_urlsafe(48)
    token_hash = _hash_reset_token(plain_token)
    expires_at = now + timedelta(minutes=PASSWORD_RESET_TOKEN_TTL_MINUTES)

    await _revoke_existing_reset_tokens(db, user_id=user.id, audience=audience, now=now)
    reset_token = models.PasswordResetToken(
        user_id=user.id,
        audience=audience,
        token_hash=token_hash,
        expires_at=expires_at,
        requested_ip=request.client.host if request.client else None,
        requested_user_agent=request.headers.get("user-agent"),
        created_at=now,
    )
    db.add(reset_token)

    config_map = await get_system_config_map(
        db,
        keys=["app_name", "platform_public_base_url", "platform_admin_base_url", "public_base_url"],
    )
    product_name = str(config_map.get("app_name") or "Next-Gen Enterprise Portal").strip() or "Next-Gen Enterprise Portal"
    reset_link = build_password_reset_link(request, audience, plain_token, config_map=config_map)
    try:
        await send_password_reset_email(
            to_email=user_email,
            username=display_name,
            db=db,
            reset_link=reset_link,
            expires_at=expires_at,
            product_name=product_name,
            locale=user_locale or locale,
        )
    except Exception as exc:
        await db.rollback()
        logger.error(
            "Failed to send password reset email user_id=%s audience=%s: %s",
            user_id,
            audience,
            exc,
        )
        _raise_reset_error(
            "PASSWORD_RESET_EMAIL_SEND_FAILED",
            "重置邮件发送失败，请稍后重试。",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    await IAMAuditService.log(
        db=db,
        action="iam.password_reset.request",
        target_type="user",
        user_id=user_id,
        username=username,
        target_id=user_id,
        target_name=username,
        detail={
            "audience": audience,
            "delivery": "email",
        },
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
        trace_id=request.headers.get("x-request-id"),
    )
    await db.commit()
    return {"message": GENERIC_RESET_REQUEST_MESSAGE}


async def _load_active_reset_token(
    db: AsyncSession,
    *,
    token: str,
    audience: str,
) -> models.PasswordResetToken:
    normalized_token = str(token or "").strip()
    if not normalized_token:
        _raise_reset_error(
            "PASSWORD_RESET_TOKEN_REQUIRED",
            "缺少密码重置令牌。",
            status.HTTP_400_BAD_REQUEST,
        )
    if audience not in SUPPORTED_AUDIENCES:
        _raise_reset_error(
            "PASSWORD_RESET_AUDIENCE_INVALID",
            "密码重置请求场景无效。",
            status.HTTP_400_BAD_REQUEST,
        )

    result = await db.execute(
        select(models.PasswordResetToken)
        .options(selectinload(models.PasswordResetToken.user))
        .where(
            models.PasswordResetToken.token_hash == _hash_reset_token(normalized_token),
            models.PasswordResetToken.audience == audience,
        )
    )
    record = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if record is None:
        _raise_reset_error(
            "PASSWORD_RESET_TOKEN_INVALID",
            "重置链接无效或已过期，请重新申请。",
            status.HTTP_400_BAD_REQUEST,
        )
    if record.used_at is not None or record.revoked_at is not None or record.expires_at <= now:
        _raise_reset_error(
            "PASSWORD_RESET_TOKEN_EXPIRED",
            "重置链接无效或已过期，请重新申请。",
            status.HTTP_400_BAD_REQUEST,
        )

    user = getattr(record, "user", None)
    if user is None or not getattr(user, "is_active", False):
        _raise_reset_error(
            "PASSWORD_RESET_ACCOUNT_UNAVAILABLE",
            "关联账户不可用，请重新申请。",
            status.HTTP_400_BAD_REQUEST,
        )
    if str(getattr(user, "auth_source", "local") or "local").lower() != "local":
        _raise_reset_error(
            "PASSWORD_MANAGED_EXTERNALLY",
            "该账户由外部目录服务管理，请联系管理员。",
            status.HTTP_409_CONFLICT,
        )
    return record


async def validate_password_reset_token(
    db: AsyncSession,
    *,
    token: str,
    audience: str,
) -> dict[str, str | None]:
    record = await _load_active_reset_token(db, token=token, audience=audience)
    user = record.user
    return {
        "message": "Password reset token is valid",
        "audience": audience,
        "username": str(getattr(user, "username", "") or ""),
        "email_masked": _mask_email(getattr(user, "email", None)),
        "expires_at": record.expires_at.isoformat(),
    }


async def confirm_password_reset(
    db: AsyncSession,
    *,
    request: Request,
    token: str,
    audience: str,
    new_password: str,
) -> dict[str, str]:
    record = await _load_active_reset_token(db, token=token, audience=audience)
    user = record.user
    user_id = int(getattr(user, "id"))
    username = str(getattr(user, "username", "") or "")
    now = datetime.now(timezone.utc)

    await set_user_password(db, user, new_password, validate=True)
    user.failed_attempts = 0
    user.locked_until = None
    record.used_at = now
    db.add(user)
    db.add(record)

    try:
        for target_audience in ("admin", "portal"):
            await IdentityService._revoke_all_sessions_for_user(
                user_id=user_id,
                audience=target_audience,
            )
    except SessionStateStoreError as exc:
        await db.rollback()
        logger.error("Failed to revoke sessions after password reset user_id=%s: %s", user_id, exc)
        IdentityService._raise_session_state_unavailable()

    await IAMAuditService.log(
        db=db,
        action="iam.password_reset.complete",
        target_type="user",
        user_id=user_id,
        username=username,
        target_id=user_id,
        target_name=username,
        detail={"audience": audience},
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("user-agent"),
        trace_id=request.headers.get("x-request-id"),
    )
    await db.commit()
    return {"message": "密码重置成功，请使用新密码登录。"}
