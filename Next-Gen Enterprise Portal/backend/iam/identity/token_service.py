"""
Token Service - JWT 编解码与 Token 工具方法

从 IdentityService 拆分而来，包含 Token 解析、验证、Cookie 管理等纯工具函数。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import Request, Response
from jose import JWTError, jwt
from core import security

logger = logging.getLogger(__name__)


def decode_token_payload(token: str | None) -> dict | None:
    if not token:
        return None

    try:
        return jwt.decode(
            token,
            security.get_jwt_secret(),
            algorithms=[security.ALGORITHM],
            options={"verify_aud": False, "verify_exp": False},
        )
    except JWTError:
        return None


def exp_to_epoch(exp_claim) -> int | None:
    if exp_claim is None:
        return None
    if isinstance(exp_claim, (int, float)):
        return int(exp_claim)
    if isinstance(exp_claim, str):
        try:
            return int(float(exp_claim))
        except ValueError:
            return None
    if isinstance(exp_claim, datetime):
        dt = exp_claim if exp_claim.tzinfo else exp_claim.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    return None


def normalize_jti(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    normalized = str(value).strip()
    return normalized or None


def normalize_user_id(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float):
        iv = int(value)
        return iv if iv > 0 else None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            iv = int(text)
            return iv if iv > 0 else None
    return None


def normalize_audience_claim(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple, set)):
        if not value:
            return None
        value = next(iter(value))
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    aud = str(value).strip().lower()
    if aud in {"admin", "portal"}:
        return aud
    return None


async def resolve_user_id_from_payload(payload: dict | None, db) -> int | None:
    if not payload:
        return None
    user_id = normalize_user_id(payload.get("uid"))
    if user_id:
        return user_id
    if db is None:
        return None
    username = (payload.get("sub") or "").strip()
    if not username:
        return None
    import modules.models as models
    from sqlalchemy import select

    result = await db.execute(select(models.User.id).filter(models.User.username == username))
    return result.scalar_one_or_none()


async def extract_token_session_meta(
    token: str | None,
    *,
    db=None,
) -> tuple[int | None, str | None, str | None, int | None]:
    payload = decode_token_payload(token)
    if not payload:
        return None, None, None, None
    user_id = await resolve_user_id_from_payload(payload, db)
    audience = normalize_audience_claim(payload.get("aud"))
    jti = normalize_jti(payload.get("jti"))
    exp_epoch = exp_to_epoch(payload.get("exp"))
    return user_id, audience, jti, exp_epoch


def collect_request_tokens(request: Request | None) -> list[str]:
    if not request:
        return []
    tokens: list[str] = []
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer = auth_header.split(" ", 1)[1].strip()
        if bearer:
            tokens.append(bearer)

    for cookie_name in ("access_token", "portal_session", "admin_session"):
        token = request.cookies.get(cookie_name)
        if token:
            tokens.append(token)

    # de-duplicate while preserving order
    return list(dict.fromkeys(tokens))


def cookie_name_by_audience(audience: str) -> str:
    return "admin_session" if audience == "admin" else "portal_session"


def clear_auth_cookies(response: Response):
    response.delete_cookie(
        key="access_token",
        path="/",
        domain=security.COOKIE_DOMAIN,
        secure=security.COOKIE_SECURE,
        samesite=security.COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key="portal_session",
        path="/",
        domain=security.COOKIE_DOMAIN,
        secure=security.COOKIE_SECURE,
        samesite=security.COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key="admin_session",
        path="/",
        domain=security.COOKIE_DOMAIN,
        secure=security.COOKIE_SECURE,
        samesite=security.COOKIE_SAMESITE,
    )


def resolve_ping_audience(request: Request, audience: str | None) -> str | None:
    normalized = normalize_audience_claim(audience)
    if normalized:
        return normalized
    has_admin = bool(request.cookies.get("admin_session"))
    has_portal = bool(request.cookies.get("portal_session"))
    if has_admin and not has_portal:
        return "admin"
    if has_portal and not has_admin:
        return "portal"
    referer = (request.headers.get("Referer") or "").lower()
    if "/admin" in referer:
        return "admin"
    if "/login" in referer or "/app" in referer:
        return "portal"
    return None


def session_start_epoch_from_payload(payload: dict | None) -> int | None:
    if not payload:
        return None
    session_start = exp_to_epoch(payload.get("session_start"))
    if session_start is not None:
        return int(session_start)
    iat_epoch = exp_to_epoch(payload.get("iat"))
    if iat_epoch is not None:
        return int(iat_epoch)
    return None
