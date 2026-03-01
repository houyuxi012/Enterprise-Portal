"""
Identity Service - 认证核心逻辑
"""
import logging
from datetime import datetime, timezone, timedelta
import ipaddress
from typing import Any
from fastapi import Request, Response, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

logger = logging.getLogger(__name__)


class IdentityService:
    """身份认证服务"""

    ACCOUNT_TYPE_SYSTEM = "SYSTEM"
    ACCOUNT_TYPE_PORTAL = "PORTAL"
    REVOKED_JTI_PREFIX = "iam:revoked:jti:"
    LOGIN_FAIL_CACHE_PREFIX = "iam:login:fail:principal:"
    LOGIN_FAIL_IP_CACHE_PREFIX = "iam:login:fail:ip:"
    LOGIN_LOCK_IP_CACHE_PREFIX = "iam:login:lock:ip:"
    LOGIN_FAIL_CACHE_TTL_SECONDS = 15 * 60
    LOCKOUT_MODE_ACCOUNT = "account"
    LOCKOUT_MODE_IP = "ip"
    SESSION_ZSET_PREFIX = "iam:sessions"
    LEGACY_ACTIVE_SESSION_PREFIX = "iam:active_sessions"
    SESSION_TTL_BUFFER_SECONDS = 30
    SESSION_REFRESH_WINDOW_MINUTES = 10
    SESSION_ABSOLUTE_TIMEOUT_MINUTES = 8 * 60
    AUTH_CODE_SESSION_EXPIRED = "SESSION_EXPIRED"
    AUTH_CODE_TOKEN_REVOKED = "TOKEN_REVOKED"
    AUTH_CODE_AUDIENCE_MISMATCH = "AUDIENCE_MISMATCH"

    @staticmethod
    def _auth_error_message(code: str) -> str:
        if code == IdentityService.AUTH_CODE_TOKEN_REVOKED:
            return "当前会话已失效，请重新登录。"
        if code == IdentityService.AUTH_CODE_AUDIENCE_MISMATCH:
            return "Audience mismatch for current session."
        return "登录会话已过期，请重新登录。"

    @staticmethod
    def _raise_auth_error(
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
                "message": message or IdentityService._auth_error_message(code),
            },
            headers=error_headers or None,
        )

    @staticmethod
    def _normalize_account_type(user) -> str:
        account_type = getattr(user, "account_type", IdentityService.ACCOUNT_TYPE_PORTAL) or IdentityService.ACCOUNT_TYPE_PORTAL
        return str(account_type).upper()

    @staticmethod
    def _has_role(user, role_codes: set[str]) -> bool:
        return any(getattr(role, "code", "") in role_codes for role in getattr(user, "roles", []))

    @staticmethod
    def _has_permission(user, permission_code: str) -> bool:
        canonical = permission_code.strip()
        normalized = canonical[7:] if canonical.startswith("portal.") else canonical
        accepted_codes = {normalized, f"portal.{normalized}"}
        for role in getattr(user, "roles", []):
            for perm in getattr(role, "permissions", []):
                current = (getattr(perm, "code", "") or "").strip()
                if current in accepted_codes:
                    return True
        return False

    @staticmethod
    def _can_login_portal(user) -> bool:
        return IdentityService._normalize_account_type(user) == IdentityService.ACCOUNT_TYPE_PORTAL

    @staticmethod
    def _can_login_admin(user) -> bool:
        account_type = IdentityService._normalize_account_type(user)
        if account_type == IdentityService.ACCOUNT_TYPE_SYSTEM:
            return True
        if account_type != IdentityService.ACCOUNT_TYPE_PORTAL:
            return False
        return IdentityService._has_permission(user, "admin:access") or IdentityService._has_role(
            user, {"PortalAdmin", "portal_admin", "SuperAdmin"}
        )

    @staticmethod
    def _revoked_jti_cache_key(jti: str) -> str:
        return f"{IdentityService.REVOKED_JTI_PREFIX}{jti}"

    @staticmethod
    def _session_zset_key(*, audience: str, user_id: int) -> str:
        aud = (audience or "unknown").strip().lower() or "unknown"
        return f"{IdentityService.SESSION_ZSET_PREFIX}:{aud}:{user_id}"

    @staticmethod
    def _legacy_active_session_key(*, audience: str, user_id: int) -> str:
        aud = (audience or "unknown").strip().lower() or "unknown"
        return f"{IdentityService.LEGACY_ACTIVE_SESSION_PREFIX}:{user_id}:{aud}"

    @staticmethod
    def _session_key_ttl_seconds(session_timeout_minutes: int) -> int:
        return max(60, int(session_timeout_minutes) * 60 + IdentityService.SESSION_TTL_BUFFER_SECONDS)

    @staticmethod
    def _normalize_jti(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, bytes):
            value = value.decode("utf-8", errors="ignore")
        normalized = str(value).strip()
        return normalized or None

    @staticmethod
    def _normalize_user_id(value: Any) -> int | None:
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

    @staticmethod
    def _normalize_audience_claim(value: Any) -> str | None:
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

    @staticmethod
    def _decode_token_payload(token: str | None) -> dict | None:
        if not token:
            return None
        import utils

        try:
            return jwt.decode(
                token,
                utils.SECRET_KEY,
                algorithms=[utils.ALGORITHM],
                options={"verify_aud": False, "verify_exp": False},
            )
        except JWTError:
            return None

    @staticmethod
    async def _resolve_user_id_from_payload(payload: dict | None, db: AsyncSession | None) -> int | None:
        if not payload:
            return None
        user_id = IdentityService._normalize_user_id(payload.get("uid"))
        if user_id:
            return user_id
        if db is None:
            return None
        username = (payload.get("sub") or "").strip()
        if not username:
            return None
        import models

        result = await db.execute(select(models.User.id).filter(models.User.username == username))
        return result.scalar_one_or_none()

    @staticmethod
    async def _extract_token_session_meta(
        token: str | None,
        *,
        db: AsyncSession | None = None,
    ) -> tuple[int | None, str | None, str | None, int | None]:
        payload = IdentityService._decode_token_payload(token)
        if not payload:
            return None, None, None, None
        user_id = await IdentityService._resolve_user_id_from_payload(payload, db)
        audience = IdentityService._normalize_audience_claim(payload.get("aud"))
        jti = IdentityService._normalize_jti(payload.get("jti"))
        exp_epoch = IdentityService._exp_to_epoch(payload.get("exp"))
        return user_id, audience, jti, exp_epoch

    @staticmethod
    def _normalize_memory_sessions(raw: Any) -> dict[str, int]:
        sessions: dict[str, int] = {}
        pairs: list[tuple[Any, Any]] = []
        if isinstance(raw, dict):
            pairs = list(raw.items())
        elif isinstance(raw, list):
            for item in raw:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    pairs.append((item[0], item[1]))
                elif isinstance(item, dict):
                    pairs.append((item.get("jti"), item.get("exp")))

        for raw_jti, raw_exp in pairs:
            jti = IdentityService._normalize_jti(raw_jti)
            exp_epoch = IdentityService._exp_to_epoch(raw_exp)
            if jti and exp_epoch is not None:
                sessions[jti] = int(exp_epoch)
        return sessions

    @staticmethod
    def _resolve_audiences(scope: str | None) -> list[str]:
        normalized = (scope or "all").strip().lower()
        if normalized in {"admin", "portal"}:
            return [normalized]
        return ["admin", "portal"]

    @staticmethod
    def _parse_user_id_from_session_key(key: str) -> int | None:
        if not key:
            return None
        parts = key.split(":")
        if len(parts) < 4:
            return None
        raw_user_id = parts[-1]
        if not raw_user_id.isdigit():
            return None
        return int(raw_user_id)

    @staticmethod
    async def _list_session_keys_for_audience(audience: str) -> list[str]:
        from services.cache_manager import cache

        prefix = f"{IdentityService.SESSION_ZSET_PREFIX}:{audience}:"
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None
        keys: list[str] = []

        if redis_client:
            pattern = f"{prefix}*"
            try:
                async for raw_key in redis_client.scan_iter(match=pattern.encode("utf-8"), count=200):
                    if isinstance(raw_key, bytes):
                        keys.append(raw_key.decode("utf-8", errors="ignore"))
                    else:
                        keys.append(str(raw_key))
                return keys
            except Exception as e:
                logger.warning("Failed to scan online session keys pattern=%s: %s", pattern, e)

        cache._ensure_lock()  # type: ignore[attr-defined]
        async with cache._lock:  # type: ignore[attr-defined]
            for cache_key in cache.memory_cache.keys():
                if isinstance(cache_key, str) and cache_key.startswith(prefix):
                    keys.append(cache_key)
        return keys

    @staticmethod
    def _collect_request_tokens(request: Request | None) -> list[str]:
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

    @staticmethod
    async def _revoke_jti_until_expiry(jti: str | None, exp_epoch: int | None) -> bool:
        normalized_jti = IdentityService._normalize_jti(jti)
        normalized_exp = IdentityService._exp_to_epoch(exp_epoch)
        if not normalized_jti or normalized_exp is None:
            return False
        from services.cache_manager import cache

        ttl = max(1, int(normalized_exp) - int(datetime.now(timezone.utc).timestamp()))
        try:
            await cache.set(
                IdentityService._revoked_jti_cache_key(normalized_jti),
                "1",
                ttl=ttl,
                is_json=False,
            )
            return True
        except Exception as e:
            logger.warning("Failed to add token jti=%s into denylist: %s", normalized_jti, e)
            return False

    @staticmethod
    async def _cleanup_expired_sessions(
        *,
        user_id: int,
        audience: str,
        session_timeout_minutes: int,
    ) -> int:
        from services.cache_manager import cache

        now_epoch = int(datetime.now(timezone.utc).timestamp())
        ttl_seconds = IdentityService._session_key_ttl_seconds(session_timeout_minutes)
        session_key = IdentityService._session_zset_key(audience=audience, user_id=user_id)
        legacy_key = IdentityService._legacy_active_session_key(audience=audience, user_id=user_id)
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None

        if redis_client:
            try:
                await redis_client.zremrangebyscore(session_key, "-inf", now_epoch)
                active_count = int(await redis_client.zcard(session_key))
                if active_count > 0:
                    await redis_client.expire(session_key, ttl_seconds)
                else:
                    await redis_client.delete(session_key)
                await cache.delete(legacy_key)
                return active_count
            except Exception as e:
                logger.warning("Session ZSET cleanup failed for key=%s: %s", session_key, e)

        raw_sessions = await cache.get(session_key)
        if raw_sessions is None:
            raw_sessions = await cache.get(legacy_key)
        sessions = IdentityService._normalize_memory_sessions(raw_sessions)
        valid_sessions: dict[str, int] = {}
        for jti, exp_epoch in sessions.items():
            if exp_epoch > now_epoch and not await IdentityService._is_jti_revoked(jti):
                valid_sessions[jti] = exp_epoch

        if valid_sessions:
            await cache.set(session_key, valid_sessions, ttl=ttl_seconds)
        else:
            await cache.delete(session_key)
        await cache.delete(legacy_key)
        return len(valid_sessions)

    @staticmethod
    async def _add_active_session(
        *,
        user_id: int,
        audience: str,
        jti: str | None,
        exp_epoch: int | None,
        session_timeout_minutes: int,
    ):
        from services.cache_manager import cache

        normalized_jti = IdentityService._normalize_jti(jti)
        normalized_exp = IdentityService._exp_to_epoch(exp_epoch)
        if not normalized_jti or normalized_exp is None:
            return

        now_epoch = int(datetime.now(timezone.utc).timestamp())
        if normalized_exp <= now_epoch:
            return

        ttl_seconds = IdentityService._session_key_ttl_seconds(session_timeout_minutes)
        session_key = IdentityService._session_zset_key(audience=audience, user_id=user_id)
        legacy_key = IdentityService._legacy_active_session_key(audience=audience, user_id=user_id)
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None

        if redis_client:
            try:
                await redis_client.zadd(session_key, {normalized_jti: float(normalized_exp)})
                await redis_client.zremrangebyscore(session_key, "-inf", now_epoch)
                await redis_client.expire(session_key, ttl_seconds)
                await cache.delete(legacy_key)
                return
            except Exception as e:
                logger.warning("Failed to add active session to ZSET key=%s: %s", session_key, e)

        raw_sessions = await cache.get(session_key)
        if raw_sessions is None:
            raw_sessions = await cache.get(legacy_key)
        sessions = IdentityService._normalize_memory_sessions(raw_sessions)
        sessions[normalized_jti] = int(normalized_exp)
        sessions = {
            session_jti: session_exp
            for session_jti, session_exp in sessions.items()
            if session_exp > now_epoch and not await IdentityService._is_jti_revoked(session_jti)
        }
        if sessions:
            await cache.set(session_key, sessions, ttl=ttl_seconds)
        else:
            await cache.delete(session_key)
        await cache.delete(legacy_key)

    @staticmethod
    async def _remove_active_session(
        *,
        user_id: int | None,
        audience: str | None,
        jti: str | None,
    ):
        if not user_id or not audience or not jti:
            return
        from services.cache_manager import cache

        normalized_jti = IdentityService._normalize_jti(jti)
        normalized_audience = IdentityService._normalize_audience_claim(audience)
        if not normalized_jti or not normalized_audience:
            return

        session_key = IdentityService._session_zset_key(audience=normalized_audience, user_id=user_id)
        legacy_key = IdentityService._legacy_active_session_key(audience=normalized_audience, user_id=user_id)
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None

        if redis_client:
            try:
                await redis_client.zrem(session_key, normalized_jti)
                await cache.delete(legacy_key)
                return
            except Exception as e:
                logger.warning("Failed to remove active session from ZSET key=%s: %s", session_key, e)

        raw_sessions = await cache.get(session_key)
        if raw_sessions is None:
            raw_sessions = await cache.get(legacy_key)
        sessions = IdentityService._normalize_memory_sessions(raw_sessions)
        if normalized_jti in sessions:
            sessions.pop(normalized_jti, None)
            if sessions:
                now_epoch = int(datetime.now(timezone.utc).timestamp())
                max_exp = max(int(exp_epoch) for exp_epoch in sessions.values())
                ttl_seconds = max(
                    60,
                    max_exp - now_epoch + IdentityService.SESSION_TTL_BUFFER_SECONDS,
                )
                await cache.set(session_key, sessions, ttl=ttl_seconds)
            else:
                await cache.delete(session_key)
        await cache.delete(legacy_key)

    @staticmethod
    async def _revoke_all_sessions_for_user(*, user_id: int, audience: str) -> int:
        from services.cache_manager import cache

        session_key = IdentityService._session_zset_key(audience=audience, user_id=user_id)
        legacy_key = IdentityService._legacy_active_session_key(audience=audience, user_id=user_id)
        now_epoch = int(datetime.now(timezone.utc).timestamp())
        revoked_count = 0
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None

        if redis_client:
            try:
                await redis_client.zremrangebyscore(session_key, "-inf", now_epoch)
                entries = await redis_client.zrange(session_key, 0, -1, withscores=True)
                for member, score in entries:
                    jti = IdentityService._normalize_jti(member)
                    exp_epoch = IdentityService._exp_to_epoch(score)
                    if await IdentityService._revoke_jti_until_expiry(jti, exp_epoch):
                        revoked_count += 1
                await redis_client.delete(session_key)
                await cache.delete(legacy_key)
                return revoked_count
            except Exception as e:
                logger.warning("Failed to revoke all sessions for key=%s: %s", session_key, e)

        raw_sessions = await cache.get(session_key)
        if raw_sessions is None:
            raw_sessions = await cache.get(legacy_key)
        sessions = IdentityService._normalize_memory_sessions(raw_sessions)
        for jti, exp_epoch in sessions.items():
            if exp_epoch > now_epoch and await IdentityService._revoke_jti_until_expiry(jti, exp_epoch):
                revoked_count += 1
        await cache.delete(session_key)
        await cache.delete(legacy_key)
        return revoked_count

    @staticmethod
    async def _resolve_current_identity(
        request: Request,
        db: AsyncSession,
    ) -> tuple[Any | None, str | None]:
        for audience in ("admin", "portal"):
            try:
                user = await IdentityService.get_current_user(request, db, audience=audience)
                return user, audience
            except HTTPException:
                continue
        return None, None

    @staticmethod
    def _clear_auth_cookies(response: Response):
        import utils

        response.delete_cookie(
            key="access_token",
            path="/",
            domain=utils.COOKIE_DOMAIN,
            secure=utils.COOKIE_SECURE,
            samesite=utils.COOKIE_SAMESITE,
        )
        response.delete_cookie(
            key="portal_session",
            path="/",
            domain=utils.COOKIE_DOMAIN,
            secure=utils.COOKIE_SECURE,
            samesite=utils.COOKIE_SAMESITE,
        )
        response.delete_cookie(
            key="admin_session",
            path="/",
            domain=utils.COOKIE_DOMAIN,
            secure=utils.COOKIE_SECURE,
            samesite=utils.COOKIE_SAMESITE,
        )

    @staticmethod
    def _exp_to_epoch(exp_claim) -> int | None:
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

    @staticmethod
    def _cookie_name_by_audience(audience: str) -> str:
        return "admin_session" if audience == "admin" else "portal_session"

    @staticmethod
    def _resolve_ping_audience(request: Request, audience: str | None) -> str | None:
        normalized = IdentityService._normalize_audience_claim(audience)
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

    @staticmethod
    def _session_start_epoch_from_payload(payload: dict | None) -> int | None:
        if not payload:
            return None
        session_start = IdentityService._exp_to_epoch(payload.get("session_start"))
        if session_start is not None:
            return int(session_start)
        iat_epoch = IdentityService._exp_to_epoch(payload.get("iat"))
        if iat_epoch is not None:
            return int(iat_epoch)
        return None

    @staticmethod
    def _parse_int_config(
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

    @staticmethod
    def _parse_lockout_scope(configs: dict) -> str:
        raw = str(configs.get("security_lockout_scope", IdentityService.LOCKOUT_MODE_ACCOUNT) or "").strip().lower()
        if raw not in {IdentityService.LOCKOUT_MODE_ACCOUNT, IdentityService.LOCKOUT_MODE_IP}:
            logger.warning("Invalid lockout scope %r, fallback=%s", raw, IdentityService.LOCKOUT_MODE_ACCOUNT)
            return IdentityService.LOCKOUT_MODE_ACCOUNT
        return raw

    @staticmethod
    async def _load_session_policy(db: AsyncSession) -> tuple[int, int, int]:
        import models
        import utils

        config_result = await db.execute(select(models.SystemConfig))
        configs = {c.key: c.value for c in config_result.scalars().all()}
        session_timeout_minutes = IdentityService._parse_int_config(
            configs,
            "login_session_timeout_minutes",
            utils.ACCESS_TOKEN_EXPIRE_MINUTES,
            min_value=5,
            max_value=43200,
        )
        refresh_window_minutes = IdentityService._parse_int_config(
            configs,
            "login_session_refresh_window_minutes",
            IdentityService.SESSION_REFRESH_WINDOW_MINUTES,
            min_value=1,
            max_value=120,
        )
        absolute_timeout_minutes = IdentityService._parse_int_config(
            configs,
            "login_session_absolute_timeout_minutes",
            IdentityService.SESSION_ABSOLUTE_TIMEOUT_MINUTES,
            min_value=5,
            max_value=43200,
        )
        if refresh_window_minutes >= session_timeout_minutes:
            refresh_window_minutes = max(1, session_timeout_minutes - 1)
        return session_timeout_minutes, refresh_window_minutes, absolute_timeout_minutes

    @staticmethod
    def _login_fail_cache_key(*, audience: str, ip: str, username: str) -> str:
        principal = (username or "").strip().lower() or "unknown"
        client_ip = ip or "unknown"
        aud = audience or "unknown"
        return f"{IdentityService.LOGIN_FAIL_CACHE_PREFIX}{aud}:{client_ip}:{principal}"

    @staticmethod
    def _login_fail_ip_cache_key(*, audience: str, ip: str) -> str:
        client_ip = ip or "unknown"
        aud = audience or "unknown"
        return f"{IdentityService.LOGIN_FAIL_IP_CACHE_PREFIX}{aud}:{client_ip}"

    @staticmethod
    def _login_lock_ip_cache_key(*, audience: str, ip: str) -> str:
        client_ip = ip or "unknown"
        aud = audience or "unknown"
        return f"{IdentityService.LOGIN_LOCK_IP_CACHE_PREFIX}{aud}:{client_ip}"

    @staticmethod
    def _parse_cached_int(raw) -> int:
        if raw is None:
            return 0
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="ignore")
        if isinstance(raw, str):
            raw = raw.strip()
            if raw == "":
                return 0
        try:
            return max(0, int(raw))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    async def _get_login_fail_count(*, audience: str, ip: str, username: str) -> int:
        from services.cache_manager import cache
        key = IdentityService._login_fail_cache_key(audience=audience, ip=ip, username=username)
        try:
            raw = await cache.get(key, is_json=False)
            return IdentityService._parse_cached_int(raw)
        except Exception:
            return 0

    @staticmethod
    async def _increase_login_fail_count(*, audience: str, ip: str, username: str) -> int:
        from services.cache_manager import cache
        key = IdentityService._login_fail_cache_key(audience=audience, ip=ip, username=username)
        count = await IdentityService._get_login_fail_count(audience=audience, ip=ip, username=username)
        count += 1
        try:
            await cache.set(
                key,
                str(count),
                ttl=IdentityService.LOGIN_FAIL_CACHE_TTL_SECONDS,
                is_json=False,
            )
        except Exception as e:
            logger.warning("Failed to update login fail counter key=%s: %s", key, e)
        return count

    @staticmethod
    async def _clear_login_fail_count(*, audience: str, ip: str, username: str):
        from services.cache_manager import cache
        key = IdentityService._login_fail_cache_key(audience=audience, ip=ip, username=username)
        try:
            await cache.delete(key)
        except Exception as e:
            logger.warning("Failed to clear login fail counter key=%s: %s", key, e)

    @staticmethod
    async def _get_login_fail_ip_count(*, audience: str, ip: str) -> int:
        from services.cache_manager import cache
        key = IdentityService._login_fail_ip_cache_key(audience=audience, ip=ip)
        try:
            raw = await cache.get(key, is_json=False)
            return IdentityService._parse_cached_int(raw)
        except Exception:
            return 0

    @staticmethod
    async def _increase_login_fail_ip_count(*, audience: str, ip: str) -> int:
        from services.cache_manager import cache
        key = IdentityService._login_fail_ip_cache_key(audience=audience, ip=ip)
        count = await IdentityService._get_login_fail_ip_count(audience=audience, ip=ip)
        count += 1
        try:
            await cache.set(
                key,
                str(count),
                ttl=IdentityService.LOGIN_FAIL_CACHE_TTL_SECONDS,
                is_json=False,
            )
        except Exception as e:
            logger.warning("Failed to update login fail IP counter key=%s: %s", key, e)
        return count

    @staticmethod
    async def _clear_login_fail_ip_count(*, audience: str, ip: str):
        from services.cache_manager import cache
        key = IdentityService._login_fail_ip_cache_key(audience=audience, ip=ip)
        try:
            await cache.delete(key)
        except Exception as e:
            logger.warning("Failed to clear login fail IP counter key=%s: %s", key, e)

    @staticmethod
    async def _is_ip_locked(*, audience: str, ip: str) -> bool:
        from services.cache_manager import cache
        key = IdentityService._login_lock_ip_cache_key(audience=audience, ip=ip)
        try:
            raw = await cache.get(key, is_json=False)
            return raw is not None
        except Exception as e:
            logger.warning("Failed to read IP lock key=%s: %s", key, e)
            return False

    @staticmethod
    async def _set_ip_lock(*, audience: str, ip: str, duration_minutes: int):
        from services.cache_manager import cache
        key = IdentityService._login_lock_ip_cache_key(audience=audience, ip=ip)
        ttl_seconds = max(60, int(duration_minutes) * 60)
        lock_until = int(datetime.now(timezone.utc).timestamp()) + ttl_seconds
        try:
            await cache.set(key, str(lock_until), ttl=ttl_seconds, is_json=False)
        except Exception as e:
            logger.warning("Failed to write IP lock key=%s: %s", key, e)

    @staticmethod
    async def _clear_ip_lock(*, audience: str, ip: str):
        from services.cache_manager import cache
        key = IdentityService._login_lock_ip_cache_key(audience=audience, ip=ip)
        try:
            await cache.delete(key)
        except Exception as e:
            logger.warning("Failed to clear IP lock key=%s: %s", key, e)

    @staticmethod
    async def _is_jti_revoked(jti: str | None) -> bool:
        if not jti:
            return True
        from services.cache_manager import cache
        try:
            revoked = await cache.get(IdentityService._revoked_jti_cache_key(jti), is_json=False)
            return revoked is not None
        except Exception as e:
            logger.warning("Failed to check token denylist for jti=%s: %s", jti, e)
            return False

    @staticmethod
    async def _revoke_token(
        token: str | None,
        *,
        db: AsyncSession | None = None,
    ):
        if not token:
            return

        user_id, audience, jti, exp_ts = await IdentityService._extract_token_session_meta(token, db=db)
        if not jti or exp_ts is None:
            return
        await IdentityService._revoke_jti_until_expiry(jti, exp_ts)
        await IdentityService._remove_active_session(
            user_id=user_id,
            audience=audience,
            jti=jti,
        )
    
    @staticmethod
    async def get_current_user(request: Request, db: AsyncSession, audience: str = None):
        """从 Cookie/Header 解析当前用户"""
        import utils
        import models

        # Infer audience from route space if caller didn't provide one.
        if audience is None:
            path = request.url.path or ""
            if path.startswith("/api/admin/"):
                audience = "admin"
            elif path.startswith("/api/app/"):
                audience = "portal"

        # Strict cookie isolation when audience is explicitly required.
        # Strict cookie isolation when audience is explicitly required.
        token = None
        if audience == "admin":
            token = request.cookies.get("admin_session")
        elif audience == "portal":
            token = request.cookies.get("portal_session")
        else:
            # Legacy/global auth fallback for endpoints that don't lock to one audience.
            token = request.cookies.get("admin_session") or request.cookies.get("portal_session")
            if not token:
                token = request.cookies.get("access_token")

        # Strict audience mode only accepts dedicated session cookie.
        # Header token fallback is only for legacy/global access.
        if not token and audience is None:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()

        if not token:
            print(f"IAM Debug: Cannot find token in cookies or headers for audience={audience}")
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

        print(f"IAM Debug: Found token for audience={audience}: {token[:15]}...")
        try:
            # Decode with audience verification if audience is specified
            options = {"verify_aud": True} if audience else {"verify_aud": False}
            payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM], audience=audience, options=options)
            username: str = payload.get("sub")
            if username is None:
                print("IAM Debug: Payload sub is None")
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
            token_jti: str | None = payload.get("jti")
            if await IdentityService._is_jti_revoked(token_jti):
                print(f"IAM Debug: Token JTI {token_jti} revoked")
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        except ExpiredSignatureError as e:
            print(f"IAM Debug: Token expired {e}")
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)
        except JWTClaimsError as e:
            print(f"IAM Debug: JWTClaimsError {e}")
            if audience and "audience" in str(e).lower():
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_AUDIENCE_MISMATCH)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        except JWTError as e:
            print(f"IAM Debug: JWTError {e}")
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        
        print(f"IAM Debug: Looking up user {username}")
        
        result = await db.execute(select(models.User).filter(models.User.username == username).options(selectinload(models.User.roles).selectinload(models.Role.permissions)))
        user = result.scalars().first()
        if user is None:
            print(f"IAM Debug: User {username} not found")
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        if not user.is_active:
            print(f"IAM Debug: User {username} is inactive")
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        return user
    
    @staticmethod
    async def _login_core(
        request: Request,
        response: Response,
        form_data: OAuth2PasswordRequestForm,
        db: AsyncSession,
        audience: str,
        cookie_name: str,
        check_admin_access: bool = False
    ) -> dict:
        """核心登录逻辑"""
        import utils
        import models
        from iam.audit.service import IAMAuditService
        
        result = await db.execute(select(models.User).filter(models.User.username == form_data.username).options(selectinload(models.User.roles).selectinload(models.Role.permissions)))
        user = result.scalars().first()
        
        ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("User-Agent", "unknown")
        trace_id = request.headers.get("X-Request-ID")
        login_fail_count = await IdentityService._get_login_fail_count(
            audience=audience,
            ip=ip,
            username=form_data.username,
        )

        # Fetch System Config
        config_result = await db.execute(select(models.SystemConfig))
        configs = {c.key: c.value for c in config_result.scalars().all()}
        captcha_threshold = IdentityService._parse_int_config(
            configs,
            "login_captcha_threshold",
            3,
            min_value=1,
            max_value=20,
        )
        max_retries = IdentityService._parse_int_config(
            configs,
            "security_login_max_retries",
            5,
            min_value=1,
            max_value=50,
        )
        lockout_duration = IdentityService._parse_int_config(
            configs,
            "security_lockout_duration",
            15,
            min_value=1,
            max_value=1440,
        )
        lockout_scope = IdentityService._parse_lockout_scope(configs)
        max_concurrent_sessions = IdentityService._parse_int_config(
            configs,
            "max_concurrent_sessions",
            0,
            min_value=0,
            max_value=100,
        )
        session_timeout = IdentityService._parse_int_config(
            configs,
            "login_session_timeout_minutes",
            utils.ACCESS_TOKEN_EXPIRE_MINUTES,
            min_value=5,
            max_value=43200,
        )
        logger.info(
            "Login session_timeout=%s min (db_value=%r, env_default=%s) for user=%s audience=%s",
            session_timeout,
            configs.get("login_session_timeout_minutes"),
            utils.ACCESS_TOKEN_EXPIRE_MINUTES,
            form_data.username,
            audience,
        )
        
        # IP Allowlist Check
        ip_allowlist_str = configs.get("security_ip_allowlist", "")
        if ip_allowlist_str:
            allowed_cidrs = [cidr.strip() for cidr in ip_allowlist_str.split(',') if cidr.strip()]
            if allowed_cidrs:
                is_allowed = False
                try:
                    client_ip_obj = ipaddress.ip_address(ip)
                    for cidr in allowed_cidrs:
                        try:
                            if client_ip_obj in ipaddress.ip_network(cidr, strict=False):
                                is_allowed = True
                                break
                        except ValueError:
                            continue
                except ValueError:
                    pass
                
                if not is_allowed:
                    await IAMAuditService.log_login(
                        db, username=form_data.username, success=False,
                        ip_address=ip, user_agent=user_agent, reason="IP not allowed", trace_id=trace_id
                    )
                    await db.commit()
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access denied from this IP address.")

        if lockout_scope == IdentityService.LOCKOUT_MODE_IP and await IdentityService._is_ip_locked(audience=audience, ip=ip):
            await IAMAuditService.log_login(
                db,
                username=form_data.username,
                success=False,
                ip_address=ip,
                user_agent=user_agent,
                reason="IP locked",
                trace_id=trace_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="IP is temporarily locked. Please try again later.",
            )

        # Captcha Check
        # Client needs to pass captcha_id and captcha_code if threshold is met/exceeded
        captcha_id = request.headers.get("X-Captcha-ID") or form_data.client_id
        captcha_code = request.headers.get("X-Captcha-Code") or form_data.client_secret
        captcha_verified = False
        
        # Require captcha based on principal/IP fail counters to reduce username enumeration signal.
        # Apply captcha threshold by principal to keep behavior predictable for admins/users.
        # IP counters are still tracked for observability and future controls, but do not
        # directly trigger captcha to avoid cross-account/cross-test contamination.
        captcha_required = login_fail_count >= captcha_threshold
        if captcha_required:
            if not captcha_id or not captcha_code:
                await IAMAuditService.log_login(
                    db,
                    username=form_data.username,
                    success=False,
                    ip_address=ip,
                    user_agent=user_agent,
                    reason="CAPTCHA required",
                    trace_id=trace_id,
                )
                await db.commit()
                raise HTTPException(
                    status_code=428,
                    detail="CAPTCHA verification required.",
                    headers={"X-Requires-Captcha": "true"}
                )
            # Verify captcha
            from routers.captcha import verify_captcha
            is_valid_captcha = await verify_captcha(captcha_id, captcha_code)
            if not is_valid_captcha:
                # Still increment failure so they get locked eventually
                await IdentityService._increase_login_fail_count(
                    audience=audience,
                    ip=ip,
                    username=form_data.username,
                )
                fail_count_ip = await IdentityService._increase_login_fail_ip_count(
                    audience=audience,
                    ip=ip,
                )
                reason_msg = "CAPTCHA invalid"
                if lockout_scope == IdentityService.LOCKOUT_MODE_ACCOUNT and user:
                    user.failed_attempts = (user.failed_attempts or 0) + 1
                    if user.failed_attempts >= max_retries:
                        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=lockout_duration)
                        reason_msg = f"Account locked after {user.failed_attempts} failed attempts"
                    db.add(user)
                if lockout_scope == IdentityService.LOCKOUT_MODE_IP and fail_count_ip >= max_retries:
                    await IdentityService._set_ip_lock(
                        audience=audience,
                        ip=ip,
                        duration_minutes=lockout_duration,
                    )
                    reason_msg = f"IP locked after {fail_count_ip} failed attempts"
                await IAMAuditService.log_login(
                    db,
                    username=form_data.username,
                    success=False,
                    ip_address=ip,
                    user_agent=user_agent,
                    reason=reason_msg,
                    trace_id=trace_id,
                )
                await db.commit()
                raise HTTPException(
                    status_code=428,
                    detail="CAPTCHA is invalid or expired.",
                    headers={
                        "X-Requires-Captcha": "true",
                        "X-Captcha-Invalid": "true",
                    }
                )
            captcha_verified = True

        # Check if user is locked (after captcha gate to avoid account-state side channel).
        if lockout_scope == IdentityService.LOCKOUT_MODE_ACCOUNT and user and user.locked_until:
            if user.locked_until > datetime.now(timezone.utc):
                await IAMAuditService.log_login(
                    db, username=form_data.username, success=False,
                    ip_address=ip, user_agent=user_agent, reason="Account locked", trace_id=trace_id
                )
                await db.commit()
                # Return generic auth failure to avoid principal state disclosure.
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect username or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            else:
                user.locked_until = None
                user.failed_attempts = 0
                db.add(user)
                await db.commit()

        # Password Verification
        if not user or not await utils.verify_password(form_data.password, user.hashed_password):
            fail_count_principal = await IdentityService._increase_login_fail_count(
                audience=audience,
                ip=ip,
                username=form_data.username,
            )
            fail_count_ip = await IdentityService._increase_login_fail_ip_count(
                audience=audience,
                ip=ip,
            )
            fail_count = fail_count_principal
            if user:
                reason_msg = "Incorrect username or password"
                if lockout_scope == IdentityService.LOCKOUT_MODE_ACCOUNT:
                    user.failed_attempts = (user.failed_attempts or 0) + 1
                    if user.failed_attempts >= max_retries:
                        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=lockout_duration)
                        reason_msg = f"Account locked after {user.failed_attempts} failed attempts"
                    db.add(user)
                elif fail_count_ip >= max_retries:
                    await IdentityService._set_ip_lock(
                        audience=audience,
                        ip=ip,
                        duration_minutes=lockout_duration,
                    )
                    reason_msg = f"IP locked after {fail_count_ip} failed attempts"
                
                # Always record audit log before raising any exception
                await IAMAuditService.log_login(
                    db, username=form_data.username, success=False,
                    ip_address=ip, user_agent=user_agent, reason=reason_msg, trace_id=trace_id
                )
                await db.commit()
                
                # Check if we should prompt for captcha now
                if fail_count >= captcha_threshold:
                    if captcha_verified:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect username or password",
                            headers={
                                "WWW-Authenticate": "Bearer",
                                "X-Requires-Captcha": "true",
                            },
                        )
                    raise HTTPException(
                        status_code=428,
                        detail="CAPTCHA verification required.",
                        headers={"X-Requires-Captcha": "true"}
                    )
            else:
                reason_msg = "Incorrect username or password"
                if lockout_scope == IdentityService.LOCKOUT_MODE_IP and fail_count_ip >= max_retries:
                    await IdentityService._set_ip_lock(
                        audience=audience,
                        ip=ip,
                        duration_minutes=lockout_duration,
                    )
                    reason_msg = f"IP locked after {fail_count_ip} failed attempts"
                await IAMAuditService.log_login(
                    db, username=form_data.username, success=False,
                    ip_address=ip, user_agent=user_agent, reason=reason_msg, trace_id=trace_id
                )
                await db.commit()
                if fail_count >= captcha_threshold:
                    if captcha_verified:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect username or password",
                            headers={
                                "WWW-Authenticate": "Bearer",
                                "X-Requires-Captcha": "true",
                            },
                        )
                    raise HTTPException(
                        status_code=428,
                        detail="CAPTCHA verification required.",
                        headers={"X-Requires-Captcha": "true"}
                    )

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check password policy compliance
        if user:
            from services.password_policy import validate_password, is_password_expired
            policy_violates = False
            try:
                # Login should only evaluate complexity/user-info/max-age policy.
                # Password history reuse is for password change/reset only.
                await validate_password(db, form_data.password, user, check_history=False)
            except HTTPException as e:
                if getattr(e, "status_code", 400) == 400:
                    policy_violates = True
                else:
                    raise e
            if await is_password_expired(db, user):
                policy_violates = True
            if getattr(user, "password_violates_policy", False) != policy_violates:
                user.password_violates_policy = policy_violates
                db.add(user)

        # Disabled accounts check
        if not user.is_active:
            await IAMAuditService.log_login(
                db, username=form_data.username, success=False,
                ip_address=ip, user_agent=user_agent, user_id=user.id, reason="Account disabled", trace_id=trace_id
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is disabled.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Portal endpoint login must only allow PORTAL identities
        if audience == "portal" and not IdentityService._can_login_portal(user):
            await IAMAuditService.log_login(
                db, username=form_data.username, success=False,
                ip_address=ip, user_agent=user_agent, user_id=user.id,
                reason="Portal access denied for non-PORTAL account", trace_id=trace_id
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: PORTAL account required.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Admin Access Check
        if check_admin_access:
            if not IdentityService._can_login_admin(user):
                await IAMAuditService.log_login(
                    db, username=form_data.username, success=False,
                    ip_address=ip, user_agent=user_agent, user_id=user.id,
                    reason="Admin access denied: requires SYSTEM or PORTAL with admin:access/PortalAdmin",
                    trace_id=trace_id
                )
                await db.commit()
                # Use 403 for permission denied after authentication, but 401 is also acceptable for login endpoint
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Admin privileges required.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        username = user.username
        user_id = user.id
        session_timeout_seconds = session_timeout * 60
        
        # Reset on success
        if user.failed_attempts > 0 or user.locked_until is not None:
            user.failed_attempts = 0
            user.locked_until = None
            db.add(user)
            await db.commit()

        # --- Active Session Cleanup + Concurrent Session Limit Check ---
        active_session_count = await IdentityService._cleanup_expired_sessions(
            user_id=user_id,
            audience=audience,
            session_timeout_minutes=session_timeout,
        )
        if max_concurrent_sessions > 0 and active_session_count >= max_concurrent_sessions:
            await IAMAuditService.log_login(
                db,
                username=username,
                success=False,
                ip_address=ip,
                user_agent=user_agent,
                user_id=user_id,
                reason="Concurrent session limit reached",
                trace_id=trace_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="该用户超过并发设定，请退出其他设备后再次尝试登陆",
            )

        # Log success
        await IAMAuditService.log_login(
            db, username=username, success=True,
            ip_address=ip, user_agent=user_agent, user_id=user_id, trace_id=trace_id
        )
        await db.commit()
        
        # Determine Session Timeout
        access_token_expires = timedelta(minutes=session_timeout)
        previous_token = request.cookies.get(cookie_name)
        if previous_token:
            # Rotate same-audience session token on login to limit concurrent stale token reuse.
            await IdentityService._revoke_token(previous_token, db=db)
        # Issue token with Audience
        session_start_epoch = int(datetime.now(timezone.utc).timestamp())
        access_token = utils.create_access_token(
            data={"sub": username, "uid": user_id, "session_start": session_start_epoch},
            expires_delta=access_token_expires,
            audience=audience,
        )
        
        # Decode token to extract JTI/exp_epoch(second) and save to active sessions.
        try:
            _, token_audience, new_jti, new_exp = await IdentityService._extract_token_session_meta(
                access_token,
                db=db,
            )
            await IdentityService._add_active_session(
                user_id=user_id,
                audience=token_audience or audience,
                jti=new_jti,
                exp_epoch=new_exp,
                session_timeout_minutes=session_timeout,
            )
        except Exception as e:
            logger.error(f"Failed to track active session: {e}")

        await IdentityService._clear_login_fail_count(
            audience=audience,
            ip=ip,
            username=form_data.username,
        )
        await IdentityService._clear_login_fail_ip_count(
            audience=audience,
            ip=ip,
        )
        if lockout_scope == IdentityService.LOCKOUT_MODE_IP:
            await IdentityService._clear_ip_lock(
                audience=audience,
                ip=ip,
            )
        
        response.set_cookie(
            key=cookie_name,
            value=access_token,
            httponly=True,
            max_age=session_timeout_seconds,
            expires=session_timeout_seconds,
            samesite=utils.COOKIE_SAMESITE,
            secure=utils.COOKIE_SECURE,
            domain=utils.COOKIE_DOMAIN,
            path="/"
        )
        
        return {"message": "Login successful", "token_type": "bearer", "access_token": access_token}

    @staticmethod
    async def login_portal(request: Request, response: Response, form_data: OAuth2PasswordRequestForm, db: AsyncSession):
        return await IdentityService._login_core(request, response, form_data, db, audience="portal", cookie_name="portal_session", check_admin_access=False)

    @staticmethod
    async def login_admin(request: Request, response: Response, form_data: OAuth2PasswordRequestForm, db: AsyncSession):
        return await IdentityService._login_core(request, response, form_data, db, audience="admin", cookie_name="admin_session", check_admin_access=True)

    @staticmethod
    async def login(
        request: Request,
        response: Response,
        form_data: OAuth2PasswordRequestForm,
        db: AsyncSession
    ) -> dict:
        """Legacy Login - wrapper for Portal Login (default)"""
        # Defaulting legacy login to portal login for backward compatibility
        # Or should it populate both? For safety, let's treat it as Portal login.
        return await IdentityService.login_portal(request, response, form_data, db)

    @staticmethod
    async def session_ping(
        *,
        request: Request,
        response: Response,
        db: AsyncSession,
        audience: str | None = None,
    ) -> dict:
        """Rolling session keepalive with absolute-timeout enforcement."""
        import utils

        try:
            resolved_audience = IdentityService._resolve_ping_audience(request, audience)
            if not resolved_audience:
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            cookie_name = IdentityService._cookie_name_by_audience(resolved_audience)
            token = request.cookies.get(cookie_name)
            if not token:
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            user = await IdentityService.get_current_user(request, db, audience=resolved_audience)
            session_timeout_minutes, refresh_window_minutes, absolute_timeout_minutes = await IdentityService._load_session_policy(db)

            payload = IdentityService._decode_token_payload(token)
            if not payload:
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            now_epoch = int(datetime.now(timezone.utc).timestamp())
            current_exp_epoch = IdentityService._exp_to_epoch(payload.get("exp"))
            current_jti = IdentityService._normalize_jti(payload.get("jti"))
            session_start_epoch = IdentityService._session_start_epoch_from_payload(payload) or now_epoch

            if not current_exp_epoch or not current_jti:
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            if current_exp_epoch <= now_epoch:
                await IdentityService._revoke_token(token, db=db)
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            absolute_timeout_seconds = int(absolute_timeout_minutes) * 60
            if (now_epoch - int(session_start_epoch)) >= absolute_timeout_seconds:
                await IdentityService._revoke_token(token, db=db)
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            await IdentityService._cleanup_expired_sessions(
                user_id=user.id,
                audience=resolved_audience,
                session_timeout_minutes=session_timeout_minutes,
            )

            refresh_threshold_seconds = int(refresh_window_minutes) * 60
            refreshed = False
            expires_at_epoch = int(current_exp_epoch)

            if (current_exp_epoch - now_epoch) < refresh_threshold_seconds:
                new_token = utils.create_access_token(
                    data={
                        "sub": user.username,
                        "uid": user.id,
                        "session_start": int(session_start_epoch),
                    },
                    expires_delta=timedelta(minutes=session_timeout_minutes),
                    audience=resolved_audience,
                )
                _, new_audience, new_jti, new_exp_epoch = await IdentityService._extract_token_session_meta(
                    new_token,
                    db=db,
                )
                if not new_jti or not new_exp_epoch:
                    IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

                await IdentityService._add_active_session(
                    user_id=user.id,
                    audience=new_audience or resolved_audience,
                    jti=new_jti,
                    exp_epoch=new_exp_epoch,
                    session_timeout_minutes=session_timeout_minutes,
                )
                await IdentityService._revoke_token(token, db=db)

                max_age_seconds = int(session_timeout_minutes) * 60
                response.set_cookie(
                    key=cookie_name,
                    value=new_token,
                    httponly=True,
                    max_age=max_age_seconds,
                    expires=max_age_seconds,
                    samesite=utils.COOKIE_SAMESITE,
                    secure=utils.COOKIE_SECURE,
                    domain=utils.COOKIE_DOMAIN,
                    path="/",
                )
                refreshed = True
                expires_at_epoch = int(new_exp_epoch)
            else:
                await IdentityService._add_active_session(
                    user_id=user.id,
                    audience=resolved_audience,
                    jti=current_jti,
                    exp_epoch=current_exp_epoch,
                    session_timeout_minutes=session_timeout_minutes,
                )

            return {
                "message": "Session keepalive successful",
                "audience": resolved_audience,
                "refreshed": refreshed,
                "expires_at_epoch": expires_at_epoch,
                "expires_in_seconds": max(0, int(expires_at_epoch) - now_epoch),
                "absolute_timeout_minutes": int(absolute_timeout_minutes),
            }
        except HTTPException as e:
            if e.status_code in (401, 419):
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)
            raise
        except Exception as e:
            logger.warning("Session ping failed: %s", e)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)
    
    @staticmethod
    async def logout(
        response: Response,
        request: Request | None = None,
        db: AsyncSession | None = None
    ) -> dict:
        """登出当前会话（token denylist + ZSET 移除当前 jti）"""
        from iam.audit.service import IAMAuditService

        current_user = None
        if request and db:
            try:
                current_user, _ = await IdentityService._resolve_current_identity(request, db)
            except Exception as e:
                logger.warning("Failed to resolve current identity for logout: %s", e)

        if request:
            for token in IdentityService._collect_request_tokens(request):
                await IdentityService._revoke_token(token, db=db)

        if current_user and request and db:
            try:
                ip = request.client.host if request.client else "unknown"
                user_agent = request.headers.get("User-Agent", "unknown")
                await IAMAuditService.log_logout(
                    db,
                    username=current_user.username,
                    user_id=current_user.id,
                    ip_address=ip,
                    user_agent=user_agent,
                )
                await db.commit()
            except Exception as e:
                logger.warning("Failed to write logout audit log: %s", e)

        IdentityService._clear_auth_cookies(response)
        return {"message": "Logout successful"}

    @staticmethod
    async def list_online_users(
        *,
        db: AsyncSession,
        audience_scope: str = "all",
        keyword: str | None = None,
    ) -> list[dict]:
        import models
        from services.cache_manager import cache

        now_epoch = int(datetime.now(timezone.utc).timestamp())
        targets = IdentityService._resolve_audiences(audience_scope)
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None
        stats: dict[int, dict[str, int | None]] = {}

        for audience in targets:
            keys = await IdentityService._list_session_keys_for_audience(audience)
            for key in keys:
                user_id = IdentityService._parse_user_id_from_session_key(key)
                if not user_id:
                    continue

                session_count = 0
                latest_exp: int | None = None

                if redis_client:
                    try:
                        await redis_client.zremrangebyscore(key, "-inf", now_epoch)
                        session_count = int(await redis_client.zcard(key))
                        if session_count <= 0:
                            await redis_client.delete(key)
                            continue
                        latest = await redis_client.zrange(key, -1, -1, withscores=True)
                        if latest:
                            latest_exp = IdentityService._exp_to_epoch(latest[0][1])
                    except Exception as e:
                        logger.warning("Failed to read online sessions for key=%s: %s", key, e)
                        continue
                else:
                    raw_sessions = await cache.get(key)
                    sessions = IdentityService._normalize_memory_sessions(raw_sessions)
                    valid_sessions: dict[str, int] = {}
                    for session_jti, exp_epoch in sessions.items():
                        if exp_epoch > now_epoch and not await IdentityService._is_jti_revoked(session_jti):
                            valid_sessions[session_jti] = exp_epoch
                    if not valid_sessions:
                        await cache.delete(key)
                        continue
                    session_count = len(valid_sessions)
                    latest_exp = max(valid_sessions.values())
                    ttl_seconds = max(
                        60,
                        latest_exp - now_epoch + IdentityService.SESSION_TTL_BUFFER_SECONDS,
                    )
                    await cache.set(key, valid_sessions, ttl=ttl_seconds)

                if session_count <= 0:
                    continue

                entry = stats.setdefault(
                    user_id,
                    {
                        "admin_sessions": 0,
                        "portal_sessions": 0,
                        "total_sessions": 0,
                        "latest_exp_epoch": None,
                    },
                )
                if audience == "admin":
                    entry["admin_sessions"] = int(entry["admin_sessions"] or 0) + session_count
                else:
                    entry["portal_sessions"] = int(entry["portal_sessions"] or 0) + session_count
                entry["total_sessions"] = int(entry["total_sessions"] or 0) + session_count
                existing_latest = IdentityService._exp_to_epoch(entry.get("latest_exp_epoch"))
                if latest_exp is not None and (existing_latest is None or latest_exp > existing_latest):
                    entry["latest_exp_epoch"] = latest_exp

        if not stats:
            return []

        user_ids = list(stats.keys())
        user_result = await db.execute(select(models.User).filter(models.User.id.in_(user_ids)))
        user_map = {user.id: user for user in user_result.scalars().all()}

        keyword_norm = (keyword or "").strip().lower()
        rows: list[dict] = []
        for user_id, item in stats.items():
            user = user_map.get(user_id)
            if not user:
                continue
            if keyword_norm:
                haystack = " ".join(
                    [
                        str(getattr(user, "username", "") or ""),
                        str(getattr(user, "name", "") or ""),
                        str(getattr(user, "email", "") or ""),
                    ]
                ).lower()
                if keyword_norm not in haystack:
                    continue

            latest_exp_epoch = IdentityService._exp_to_epoch(item.get("latest_exp_epoch"))
            rows.append(
                {
                    "user_id": user.id,
                    "username": user.username,
                    "name": getattr(user, "name", None),
                    "email": getattr(user, "email", None),
                    "avatar": getattr(user, "avatar", None),
                    "is_active": bool(getattr(user, "is_active", True)),
                    "admin_sessions": int(item.get("admin_sessions") or 0),
                    "portal_sessions": int(item.get("portal_sessions") or 0),
                    "total_sessions": int(item.get("total_sessions") or 0),
                    "latest_exp_epoch": latest_exp_epoch,
                    "latest_exp_at": (
                        datetime.fromtimestamp(latest_exp_epoch, tz=timezone.utc)
                        if latest_exp_epoch is not None
                        else None
                    ),
                }
            )

        rows.sort(key=lambda x: (x["total_sessions"], x["latest_exp_epoch"] or 0), reverse=True)
        return rows

    @staticmethod
    async def logout_all(
        *,
        response: Response,
        request: Request,
        db: AsyncSession,
        audience_scope: str = "all",
    ) -> dict:
        """登出当前用户全部会话（按 audience/all）。"""
        from iam.audit.service import IAMAuditService

        current_user, _ = await IdentityService._resolve_current_identity(request, db)
        if not current_user:
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

        revoked_sessions = 0
        target_audiences = IdentityService._resolve_audiences(audience_scope)
        for audience in target_audiences:
            revoked_sessions += await IdentityService._revoke_all_sessions_for_user(
                user_id=current_user.id,
                audience=audience,
            )

        # Ensure current request token/cookies are also denylisted, even if issued before ZSET tracking.
        for token in IdentityService._collect_request_tokens(request):
            await IdentityService._revoke_token(token, db=db)

        try:
            ip = request.client.host if request.client else "unknown"
            user_agent = request.headers.get("User-Agent", "unknown")
            trace_id = request.headers.get("X-Request-ID")
            await IAMAuditService.log(
                db=db,
                action="iam.logout.all",
                target_type="session",
                user_id=current_user.id,
                username=current_user.username,
                target_id=current_user.id,
                target_name=current_user.username,
                detail={
                    "audience_scope": audience_scope,
                    "revoked_sessions": revoked_sessions,
                },
                ip_address=ip,
                user_agent=user_agent,
                trace_id=trace_id,
            )
            await db.commit()
        except Exception as e:
            logger.warning("Failed to write logout_all audit log: %s", e)

        IdentityService._clear_auth_cookies(response)
        return {
            "message": "Logout all successful",
            "audience_scope": audience_scope,
            "revoked_sessions": revoked_sessions,
        }

    @staticmethod
    async def kick_user_sessions(
        *,
        operator,
        target_user_id: int,
        audience_scope: str,
        request: Request,
        db: AsyncSession,
    ) -> dict:
        """管理员踢指定用户下线（按 audience/all）。"""
        import models
        from iam.audit.service import IAMAuditService

        result = await db.execute(select(models.User).filter(models.User.id == target_user_id))
        target_user = result.scalars().first()
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        revoked_sessions = 0
        target_audiences = IdentityService._resolve_audiences(audience_scope)
        for audience in target_audiences:
            revoked_sessions += await IdentityService._revoke_all_sessions_for_user(
                user_id=target_user.id,
                audience=audience,
            )

        ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("User-Agent", "unknown")
        trace_id = request.headers.get("X-Request-ID")
        await IAMAuditService.log(
            db=db,
            action="iam.session.kick",
            target_type="session",
            user_id=operator.id,
            username=operator.username,
            target_id=target_user.id,
            target_name=target_user.username,
            detail={
                "audience_scope": audience_scope,
                "revoked_sessions": revoked_sessions,
            },
            ip_address=ip,
            user_agent=user_agent,
            trace_id=trace_id,
        )
        await db.commit()
        return {
            "message": "User sessions revoked",
            "target_user_id": target_user.id,
            "target_username": target_user.username,
            "audience_scope": audience_scope,
            "revoked_sessions": revoked_sessions,
        }
