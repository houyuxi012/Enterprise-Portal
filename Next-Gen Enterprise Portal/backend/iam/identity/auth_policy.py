"""
Auth Policy - 认证策略、权限检查、配置解析

从 IdentityService 拆分而来，包含认证错误处理、角色/权限检查、MFA 策略、
会话策略加载等方法。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from core import security

logger = logging.getLogger(__name__)

# ── 常量 ──
ACCOUNT_TYPE_SYSTEM = "SYSTEM"
ACCOUNT_TYPE_PORTAL = "PORTAL"

AUTH_CODE_SESSION_EXPIRED = "SESSION_EXPIRED"
AUTH_CODE_TOKEN_REVOKED = "TOKEN_REVOKED"
AUTH_CODE_AUDIENCE_MISMATCH = "AUDIENCE_MISMATCH"
AUTH_CODE_SESSION_STATE_UNAVAILABLE = "SESSION_STATE_UNAVAILABLE"

SESSION_REFRESH_WINDOW_MINUTES = 10
SESSION_ABSOLUTE_TIMEOUT_MINUTES = 8 * 60


def auth_error_message(code: str) -> str:
    if code == AUTH_CODE_TOKEN_REVOKED:
        return "当前会话已失效，请重新登录。"
    if code == AUTH_CODE_AUDIENCE_MISMATCH:
        return "Audience mismatch for current session."
    if code == AUTH_CODE_SESSION_STATE_UNAVAILABLE:
        return "会话安全状态服务暂时不可用，请稍后重试。"
    return "登录会话已过期，请重新登录。"


def raise_auth_error(
    *,
    code: str,
    message: str | None = None,
    status_code: int = status.HTTP_401_UNAUTHORIZED,
    headers: dict[str, str] | None = None,
) -> None:
    error_headers = dict(headers or {})
    if status_code == status.HTTP_401_UNAUTHORIZED and "WWW-Authenticate" not in error_headers:
        error_headers["WWW-Authenticate"] = "Bearer"
    raise HTTPException(
        status_code=status_code,
        detail={
            "code": code,
            "message": message or auth_error_message(code),
        },
        headers=error_headers or None,
    )


def raise_session_state_unavailable(message: str | None = None) -> None:
    raise_auth_error(
        code=AUTH_CODE_SESSION_STATE_UNAVAILABLE,
        message=message,
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def normalize_account_type(user) -> str:
    account_type = getattr(user, "account_type", ACCOUNT_TYPE_PORTAL) or ACCOUNT_TYPE_PORTAL
    return str(account_type).upper()


def has_role(user, role_codes: set[str]) -> bool:
    return any(getattr(role, "code", "") in role_codes for role in getattr(user, "roles", []))


def has_permission(user, permission_code: str) -> bool:
    canonical = permission_code.strip()
    normalized = canonical[7:] if canonical.startswith("portal.") else canonical
    accepted_codes = {normalized, f"portal.{normalized}"}
    for role in getattr(user, "roles", []):
        for perm in getattr(role, "permissions", []):
            current = (getattr(perm, "code", "") or "").strip()
            if current in accepted_codes:
                return True
    return False


def can_login_portal(user) -> bool:
    return normalize_account_type(user) == ACCOUNT_TYPE_PORTAL


def can_login_admin(user) -> bool:
    account_type = normalize_account_type(user)
    if account_type == ACCOUNT_TYPE_SYSTEM:
        return True
    if account_type != ACCOUNT_TYPE_PORTAL:
        return False
    return has_permission(user, "admin:access") or has_role(
        user, {"PortalAdmin", "portal_admin", "SuperAdmin"}
    )


def _normalize_api_path(path: str) -> str:
    normalized = (path or "").strip()
    if not normalized:
        return "/"
    if normalized == "/":
        return normalized
    return normalized.rstrip("/")


def is_mfa_setup_exempt_path(path: str) -> bool:
    safe_path = _normalize_api_path(path)
    return (
        safe_path.startswith("/api/v1/mfa/")
        or safe_path.startswith("/api/v1/iam/auth/logout")
        or safe_path.startswith("/api/v1/iam/auth/me")
    )


async def is_system_mfa_forced(db: AsyncSession) -> bool:
    import modules.models as models

    result = await db.execute(
        select(models.SystemConfig.value).filter(models.SystemConfig.key == "security_mfa_enabled")
    )
    value = result.scalar_one_or_none()
    return str(value or "").strip().lower() == "true"


async def get_enabled_mfa_methods(user, db: AsyncSession) -> list[str]:
    import modules.models as models

    methods: list[str] = []
    if bool(getattr(user, "totp_enabled", False)):
        methods.append("totp")
    if bool(getattr(user, "email_mfa_enabled", False)) and bool(getattr(user, "email", "")):
        methods.append("email")

    webauthn_count_result = await db.execute(
        select(func.count()).select_from(models.WebAuthnCredential).filter(
            models.WebAuthnCredential.user_id == user.id
        )
    )
    if (webauthn_count_result.scalar() or 0) > 0:
        methods.append("webauthn")
    return methods


def parse_int_config(
    configs: dict,
    key: str,
    default: int,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    raw = configs.get(key)
    value = default
    if raw is not None and str(raw).strip() != "":
        try:
            value = int(str(raw).strip())
        except (TypeError, ValueError):
            logger.warning("Invalid integer config %s=%r, fallback=%s", key, raw, default)
            value = default
    if min_value is not None and value < min_value:
        logger.warning("Config %s=%s below min=%s, clamped", key, value, min_value)
        value = min_value
    if max_value is not None and value > max_value:
        logger.warning("Config %s=%s above max=%s, clamped", key, value, max_value)
        value = max_value
    return value


def parse_lockout_scope(configs: dict) -> str:
    from iam.identity.lockout_service import LOCKOUT_MODE_ACCOUNT

    raw = str(configs.get("security_lockout_scope", LOCKOUT_MODE_ACCOUNT) or "").strip().lower()
    if raw not in {LOCKOUT_MODE_ACCOUNT, "ip"}:
        logger.warning("Invalid lockout scope %r, fallback=%s", raw, LOCKOUT_MODE_ACCOUNT)
        return LOCKOUT_MODE_ACCOUNT
    return raw


async def load_session_policy(db: AsyncSession, *, audience: str | None = None) -> tuple[int, int, int]:
    import modules.models as models

    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}

    # Portal uses login_session_timeout_minutes, Admin uses admin_session_timeout_minutes.
    if audience == "admin":
        config_key = "admin_session_timeout_minutes"
    else:
        config_key = "login_session_timeout_minutes"
    session_timeout_minutes = parse_int_config(
        configs,
        config_key,
        security.ACCESS_TOKEN_EXPIRE_MINUTES,
        min_value=5,
        max_value=43200,
    )
    refresh_window_minutes = parse_int_config(
        configs,
        "login_session_refresh_window_minutes",
        SESSION_REFRESH_WINDOW_MINUTES,
        min_value=1,
        max_value=120,
    )
    absolute_timeout_minutes = parse_int_config(
        configs,
        "login_session_absolute_timeout_minutes",
        SESSION_ABSOLUTE_TIMEOUT_MINUTES,
        min_value=5,
        max_value=43200,
    )
    if refresh_window_minutes >= session_timeout_minutes:
        refresh_window_minutes = max(1, session_timeout_minutes - 1)
    return session_timeout_minutes, refresh_window_minutes, absolute_timeout_minutes
