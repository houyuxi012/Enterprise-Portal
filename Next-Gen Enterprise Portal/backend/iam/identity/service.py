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
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

from core import security
from modules.iam.services.auth_helpers import create_mfa_token
from modules.iam.services.privacy_consent import (
    build_mfa_privacy_claims,
    persist_authenticated_privacy_consent,
    prepare_login_privacy_consent,
)

logger = logging.getLogger(__name__)


class SessionStateStoreError(RuntimeError):
    """Raised when session revocation state cannot be safely read or written."""


def _normalize_api_path(path: str) -> str:
    normalized = (path or "").strip()
    if not normalized:
        return "/"
    if normalized == "/":
        return normalized
    return normalized.rstrip("/")


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
    AUTH_CODE_SESSION_STATE_UNAVAILABLE = "SESSION_STATE_UNAVAILABLE"

    @staticmethod
    def _auth_error_message(code: str) -> str:
        from iam.identity.auth_policy import auth_error_message
        return auth_error_message(code)

    @staticmethod
    def _raise_auth_error(
        *,
        code: str,
        message: str | None = None,
        status_code: int = status.HTTP_401_UNAUTHORIZED,
        headers: dict[str, str] | None = None,
    ) -> None:
        from iam.identity.auth_policy import raise_auth_error
        raise_auth_error(
            code=code,
            message=message,
            status_code=status_code,
            headers=headers,
        )

    @staticmethod
    def _raise_session_state_unavailable(message: str | None = None) -> None:
        from iam.identity.auth_policy import raise_session_state_unavailable
        raise_session_state_unavailable(message)

    @staticmethod
    def _normalize_account_type(user) -> str:
        from iam.identity.auth_policy import normalize_account_type
        return normalize_account_type(user)

    @staticmethod
    def _has_role(user, role_codes: set[str]) -> bool:
        from iam.identity.auth_policy import has_role
        return has_role(user, role_codes)

    @staticmethod
    def _has_permission(user, permission_code: str) -> bool:
        from iam.identity.auth_policy import has_permission
        return has_permission(user, permission_code)

    @staticmethod
    def _can_login_portal(user) -> bool:
        from iam.identity.auth_policy import can_login_portal
        return can_login_portal(user)

    @staticmethod
    def _can_login_admin(user) -> bool:
        from iam.identity.auth_policy import can_login_admin
        return can_login_admin(user)

    @staticmethod
    def _is_mfa_setup_exempt_path(path: str) -> bool:
        from iam.identity.auth_policy import is_mfa_setup_exempt_path
        return is_mfa_setup_exempt_path(path)

    @staticmethod
    async def _is_system_mfa_forced(db: AsyncSession) -> bool:
        from iam.identity.auth_policy import is_system_mfa_forced
        return await is_system_mfa_forced(db)

    @staticmethod
    async def _get_enabled_mfa_methods(user, db: AsyncSession) -> list[str]:
        from iam.identity.auth_policy import get_enabled_mfa_methods
        return await get_enabled_mfa_methods(user, db)

    @staticmethod
    def _revoked_jti_cache_key(jti: str) -> str:
        from iam.identity.session_manager import revoked_jti_cache_key
        return revoked_jti_cache_key(jti)

    @staticmethod
    def _session_zset_key(*, audience: str, user_id: int) -> str:
        from iam.identity.session_manager import session_zset_key
        return session_zset_key(audience=audience, user_id=user_id)

    @staticmethod
    def _legacy_active_session_key(*, audience: str, user_id: int) -> str:
        from iam.identity.session_manager import legacy_active_session_key
        return legacy_active_session_key(audience=audience, user_id=user_id)

    @staticmethod
    def _session_key_ttl_seconds(session_timeout_minutes: int) -> int:
        from iam.identity.session_manager import session_key_ttl_seconds
        return session_key_ttl_seconds(session_timeout_minutes)

    @staticmethod
    def _normalize_jti(value: Any) -> str | None:
        from iam.identity.token_service import normalize_jti
        return normalize_jti(value)

    @staticmethod
    def _normalize_user_id(value: Any) -> int | None:
        from iam.identity.token_service import normalize_user_id
        return normalize_user_id(value)

    @staticmethod
    def _normalize_audience_claim(value: Any) -> str | None:
        from iam.identity.token_service import normalize_audience_claim
        return normalize_audience_claim(value)

    @staticmethod
    def _decode_token_payload(token: str | None) -> dict | None:
        from iam.identity.token_service import decode_token_payload
        return decode_token_payload(token)

    @staticmethod
    async def _resolve_user_id_from_payload(payload: dict | None, db: AsyncSession | None) -> int | None:
        from iam.identity.token_service import resolve_user_id_from_payload
        return await resolve_user_id_from_payload(payload, db)
        username = (payload.get("sub") or "").strip()
        if not username:
            return None
        import modules.models as models

        result = await db.execute(select(models.User.id).filter(models.User.username == username))
        return result.scalar_one_or_none()

    @staticmethod
    async def _extract_token_session_meta(
        token: str | None,
        *,
        db: AsyncSession | None = None,
    ) -> tuple[int | None, str | None, str | None, int | None]:
        from iam.identity.token_service import extract_token_session_meta
        return await extract_token_session_meta(token, db=db)

    @staticmethod
    def _normalize_memory_sessions(raw: Any) -> dict[str, int]:
        from iam.identity.session_manager import normalize_memory_sessions
        return normalize_memory_sessions(raw)

    @staticmethod
    def _resolve_audiences(scope: str | None) -> list[str]:
        from iam.identity.session_manager import resolve_audiences
        return resolve_audiences(scope)

    @staticmethod
    def _parse_user_id_from_session_key(key: str) -> int | None:
        from iam.identity.session_manager import parse_user_id_from_session_key
        return parse_user_id_from_session_key(key)

    @staticmethod
    async def _list_session_keys_for_audience(audience: str) -> list[str]:
        from iam.identity.session_manager import list_session_keys_for_audience
        return await list_session_keys_for_audience(audience)

    @staticmethod
    def _collect_request_tokens(request: Request | None) -> list[str]:
        from iam.identity.token_service import collect_request_tokens
        return collect_request_tokens(request)

    @staticmethod
    async def _revoke_jti_until_expiry(jti: str | None, exp_epoch: int | None) -> bool:
        from iam.identity.session_manager import revoke_jti_until_expiry
        return await revoke_jti_until_expiry(jti, exp_epoch)

    @staticmethod
    async def _cleanup_expired_sessions(
        *,
        user_id: int,
        audience: str,
        session_timeout_minutes: int,
    ) -> int:
        from iam.identity.session_manager import cleanup_expired_sessions
        return await cleanup_expired_sessions(
            user_id=user_id,
            audience=audience,
            session_timeout_minutes=session_timeout_minutes,
        )

    @staticmethod
    async def _add_active_session(
        *,
        user_id: int,
        audience: str,
        jti: str | None,
        exp_epoch: int | None,
        session_timeout_minutes: int,
    ):
        from iam.identity.session_manager import add_active_session
        await add_active_session(
            user_id=user_id,
            audience=audience,
            jti=jti,
            exp_epoch=exp_epoch,
            session_timeout_minutes=session_timeout_minutes,
        )

    @staticmethod
    async def _remove_active_session(
        *,
        user_id: int | None,
        audience: str | None,
        jti: str | None,
    ):
        from iam.identity.session_manager import remove_active_session
        await remove_active_session(
            user_id=user_id,
            audience=audience,
            jti=jti,
        )

    @staticmethod
    async def _revoke_all_sessions_for_user(*, user_id: int, audience: str) -> int:
        from iam.identity.session_manager import revoke_all_sessions_for_user
        return await revoke_all_sessions_for_user(user_id=user_id, audience=audience)


    @staticmethod
    async def _resolve_current_identity(
        request: Request,
        db: AsyncSession,
    ) -> tuple[Any | None, str | None]:
        for audience in ("admin", "portal"):
            try:
                user = await IdentityService.get_current_user(request, db, audience=audience)
                return user, audience
            except HTTPException as exc:
                if exc.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
                    raise
                continue
        return None, None

    @staticmethod
    def _clear_auth_cookies(response: Response):
        from iam.identity.token_service import clear_auth_cookies
        clear_auth_cookies(response)

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
        from iam.identity.token_service import cookie_name_by_audience
        return cookie_name_by_audience(audience)

    @staticmethod
    def _resolve_ping_audience(request: Request, audience: str | None) -> str | None:
        from iam.identity.token_service import resolve_ping_audience
        return resolve_ping_audience(request, audience)

    @staticmethod
    def _session_start_epoch_from_payload(payload: dict | None) -> int | None:
        from iam.identity.token_service import session_start_epoch_from_payload
        return session_start_epoch_from_payload(payload)

    @staticmethod
    def _parse_int_config(
        configs: dict,
        key: str,
        default: int,
        *,
        min_value: int | None = None,
        max_value: int | None = None,
    ) -> int:
        from iam.identity.auth_policy import parse_int_config
        return parse_int_config(configs, key, default, min_value=min_value, max_value=max_value)

    @staticmethod
    def _parse_lockout_scope(configs: dict) -> str:
        from iam.identity.auth_policy import parse_lockout_scope
        return parse_lockout_scope(configs)

    @staticmethod
    async def _load_session_policy(db: AsyncSession, *, audience: str | None = None) -> tuple[int, int, int]:
        from iam.identity.auth_policy import load_session_policy
        return await load_session_policy(db, audience=audience)

    @staticmethod
    def _login_fail_cache_key(*, audience: str, ip: str, username: str) -> str:
        from iam.identity.lockout_service import login_fail_cache_key
        return login_fail_cache_key(audience=audience, ip=ip, username=username)

    @staticmethod
    def _login_fail_ip_cache_key(*, audience: str, ip: str) -> str:
        from iam.identity.lockout_service import login_fail_ip_cache_key
        return login_fail_ip_cache_key(audience=audience, ip=ip)

    @staticmethod
    def _login_lock_ip_cache_key(*, audience: str, ip: str) -> str:
        from iam.identity.lockout_service import login_lock_ip_cache_key
        return login_lock_ip_cache_key(audience=audience, ip=ip)

    @staticmethod
    def _parse_cached_int(raw) -> int:
        from iam.identity.lockout_service import parse_cached_int
        return parse_cached_int(raw)

    @staticmethod
    async def _get_login_fail_count(*, audience: str, ip: str, username: str) -> int:
        from iam.identity.lockout_service import get_login_fail_count
        return await get_login_fail_count(audience=audience, ip=ip, username=username)

    @staticmethod
    async def _increase_login_fail_count(*, audience: str, ip: str, username: str) -> int:
        from iam.identity.lockout_service import increase_login_fail_count
        return await increase_login_fail_count(audience=audience, ip=ip, username=username)

    @staticmethod
    async def _clear_login_fail_count(*, audience: str, ip: str, username: str):
        from iam.identity.lockout_service import clear_login_fail_count
        await clear_login_fail_count(audience=audience, ip=ip, username=username)

    @staticmethod
    async def _get_login_fail_ip_count(*, audience: str, ip: str) -> int:
        from iam.identity.lockout_service import get_login_fail_ip_count
        return await get_login_fail_ip_count(audience=audience, ip=ip)

    @staticmethod
    async def _increase_login_fail_ip_count(*, audience: str, ip: str) -> int:
        from iam.identity.lockout_service import increase_login_fail_ip_count
        return await increase_login_fail_ip_count(audience=audience, ip=ip)

    @staticmethod
    async def _clear_login_fail_ip_count(*, audience: str, ip: str):
        from iam.identity.lockout_service import clear_login_fail_ip_count
        await clear_login_fail_ip_count(audience=audience, ip=ip)

    @staticmethod
    async def _is_ip_locked(*, audience: str, ip: str) -> bool:
        from iam.identity.lockout_service import is_ip_locked
        return await is_ip_locked(audience=audience, ip=ip)

    @staticmethod
    async def _set_ip_lock(*, audience: str, ip: str, duration_minutes: int):
        from iam.identity.lockout_service import set_ip_lock
        await set_ip_lock(audience=audience, ip=ip, duration_minutes=duration_minutes)

    @staticmethod
    async def _clear_ip_lock(*, audience: str, ip: str):
        from iam.identity.lockout_service import clear_ip_lock
        await clear_ip_lock(audience=audience, ip=ip)

    @staticmethod
    async def _is_jti_revoked(jti: str | None) -> bool:
        from iam.identity.session_manager import is_jti_revoked
        return await is_jti_revoked(jti)

    @staticmethod
    async def _revoke_token(
        token: str | None,
        *,
        db: AsyncSession | None = None,
    ):
        from iam.identity.session_manager import revoke_token
        await revoke_token(token, db=db)
    
    @staticmethod
    async def get_current_user(request: Request, db: AsyncSession, audience: str | None = None):
        """从 Cookie/Header 解析当前用户"""
        import modules.models as models

        # Infer audience from route space if caller didn't provide one.
        if audience is None:
            path = _normalize_api_path(request.url.path or "")
            if path.startswith("/api/v1/admin/") or path.startswith("/api/v1/system/"):
                audience = "admin"
            elif path.startswith("/api/v1/app/"):
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
            logger.debug("Auth token not found in request cookies/headers (audience=%s)", audience)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

        try:
            # Decode with audience verification if audience is specified
            options = {"verify_aud": True} if audience else {"verify_aud": False}
            payload = jwt.decode(
                token,
                security.get_jwt_secret(),
                algorithms=[security.ALGORITHM],
                audience=audience,
                options=options,
            )
            username: str = payload.get("sub")
            if username is None:
                logger.debug("JWT payload missing subject claim.")
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
            token_jti: str | None = payload.get("jti")
            if await IdentityService._is_jti_revoked(token_jti):
                logger.debug("Token revoked (jti=%s).", token_jti)
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        except SessionStateStoreError as e:
            logger.error("Token denylist check unavailable (audience=%s): %s", audience, e)
            IdentityService._raise_session_state_unavailable()
        except ExpiredSignatureError as e:
            logger.debug("JWT expired: %s", e)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)
        except JWTClaimsError as e:
            logger.debug("JWT claims validation failed: %s", e)
            if audience and "audience" in str(e).lower():
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_AUDIENCE_MISMATCH)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        except JWTError as e:
            logger.debug("JWT decode failed: %s", e)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)

        result = await db.execute(select(models.User).filter(models.User.username == username).options(selectinload(models.User.roles).selectinload(models.Role.permissions)))
        user = result.scalars().first()
        if user is None:
            logger.debug("JWT subject user not found: %s", username)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)
        if not user.is_active:
            logger.debug("Inactive user attempted access: %s", username)
            IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_TOKEN_REVOKED)

        # Enforce global MFA binding on backend side to prevent client bypass.
        # Allow only MFA-related and logout/me endpoints before user finishes binding.
        if await IdentityService._is_system_mfa_forced(db):
            enabled_methods = await IdentityService._get_enabled_mfa_methods(user, db)
            if not enabled_methods and not IdentityService._is_mfa_setup_exempt_path(request.url.path):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "MFA_SETUP_REQUIRED",
                        "message": "系统要求先完成多因素认证绑定后再继续使用。",
                    },
                )
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
        import modules.models as models
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
        # Portal uses login_session_timeout_minutes, Admin uses admin_session_timeout_minutes.
        if audience == "admin":
            config_key = "admin_session_timeout_minutes"
        else:
            config_key = "login_session_timeout_minutes"
        session_timeout = IdentityService._parse_int_config(
            configs,
            config_key,
            security.ACCESS_TOKEN_EXPIRE_MINUTES,
            min_value=5,
            max_value=43200,
        )
        logger.info(
            "Login session_timeout=%s min (audience=%s, db_value=%r, env_default=%s) for user=%s",
            session_timeout,
            audience,
            configs.get("login_session_timeout_minutes"),
            security.ACCESS_TOKEN_EXPIRE_MINUTES,
            form_data.username,
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
            from modules.iam.services.auth_helpers import verify_captcha
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
        if not user or not await security.verify_password(form_data.password, user.hashed_password):
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
            from modules.iam.services.password_policy import validate_password, is_password_expired
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

        pending_privacy_consent = await prepare_login_privacy_consent(
            db=db,
            request=request,
            user=user,
            audience=audience,
        )

        # ── MFA Challenge Gate ──
        mfa_forced = False
        try:
            from modules.iam.services.auth_helpers import get_system_mfa_config
            mfa_forced = await get_system_mfa_config(db)
        except Exception:
            pass

        enabled_mfa_methods = await IdentityService._get_enabled_mfa_methods(user, db)

        if enabled_mfa_methods:
            # User has at least one MFA factor bound → require MFA challenge
            if "email" in enabled_mfa_methods:
                try:
                    from modules.iam.services.email_service import send_email_otp

                    await send_email_otp(user.email, user.username, db, locale=getattr(user, "locale", None))
                except Exception as e:
                    if set(enabled_mfa_methods) == {"email"}:
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail={
                                "code": "EMAIL_MFA_SEND_FAILED",
                                "message": f"邮箱验证码发送失败：{e}",
                            },
                        )
                    logger.warning(
                        "Failed to send email MFA code for user=%s during login challenge: %s",
                        user.username,
                        e,
                    )

            mfa_provider = "admin" if check_admin_access else "local"
            mfa_token = create_mfa_token(
                user,
                provider=mfa_provider,
                extra_claims=build_mfa_privacy_claims(pending_privacy_consent),
            )
            # Reset fail counters on valid password
            if user.failed_attempts > 0 or user.locked_until is not None:
                user.failed_attempts = 0
                user.locked_until = None
                db.add(user)
            await IdentityService._clear_login_fail_count(
                audience=audience, ip=ip, username=form_data.username,
            )
            await IdentityService._clear_login_fail_ip_count(audience=audience, ip=ip)
            await db.commit()
            return {
                "message": "MFA verification required",
                "token_type": "bearer",
                "access_token": "",
                "mfa_required": True,
                "mfa_token": mfa_token,
                "mfa_methods": enabled_mfa_methods,
            }

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
        try:
            active_session_count = await IdentityService._cleanup_expired_sessions(
                user_id=user_id,
                audience=audience,
                session_timeout_minutes=session_timeout,
            )
        except SessionStateStoreError as e:
            logger.error(
                "Failed to evaluate active sessions during login user=%s audience=%s: %s",
                username,
                audience,
                e,
            )
            IdentityService._raise_session_state_unavailable()
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

        await persist_authenticated_privacy_consent(
            db=db,
            request=request,
            user=user,
            audience=audience,
            consent=pending_privacy_consent,
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
            try:
                await IdentityService._revoke_token(previous_token, db=db)
            except SessionStateStoreError as e:
                logger.error(
                    "Failed to revoke previous token during login rotation user=%s audience=%s: %s",
                    username,
                    audience,
                    e,
                )
                IdentityService._raise_session_state_unavailable()
        # Issue token with Audience
        session_start_epoch = int(datetime.now(timezone.utc).timestamp())
        access_token = security.create_access_token(
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
        except SessionStateStoreError as e:
            logger.error(
                "Failed to persist active session state user=%s audience=%s: %s",
                username,
                audience,
                e,
            )
            IdentityService._raise_session_state_unavailable()
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
            samesite=security.COOKIE_SAMESITE,
            secure=security.COOKIE_SECURE,
            domain=security.COOKIE_DOMAIN,
            path="/"
        )
        
        result = {"message": "Login successful", "token_type": "bearer", "access_token": access_token}
        if mfa_forced and not enabled_mfa_methods:
            result["mfa_setup_required"] = True
        return result

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

        try:
            resolved_audience = IdentityService._resolve_ping_audience(request, audience)
            if not resolved_audience:
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            cookie_name = IdentityService._cookie_name_by_audience(resolved_audience)
            token = request.cookies.get(cookie_name)
            if not token:
                IdentityService._raise_auth_error(code=IdentityService.AUTH_CODE_SESSION_EXPIRED)

            user = await IdentityService.get_current_user(request, db, audience=resolved_audience)
            session_timeout_minutes, refresh_window_minutes, absolute_timeout_minutes = await IdentityService._load_session_policy(db, audience=resolved_audience)

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
                new_token = security.create_access_token(
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
                    samesite=security.COOKIE_SAMESITE,
                    secure=security.COOKIE_SECURE,
                    domain=security.COOKIE_DOMAIN,
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
        except SessionStateStoreError as e:
            logger.error("Session ping failed because session state is unavailable: %s", e)
            IdentityService._raise_session_state_unavailable()
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
            except HTTPException as e:
                if e.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
                    raise
                logger.warning("Failed to resolve current identity for logout: %s", e)
            except Exception as e:
                logger.warning("Failed to resolve current identity for logout: %s", e)

        if request:
            try:
                for token in IdentityService._collect_request_tokens(request):
                    await IdentityService._revoke_token(token, db=db)
            except SessionStateStoreError as e:
                logger.error("Failed to revoke current session during logout: %s", e)
                IdentityService._raise_session_state_unavailable()

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
        import modules.models as models
        from infrastructure.cache_manager import cache

        now_epoch = int(datetime.now(timezone.utc).timestamp())
        targets = IdentityService._resolve_audiences(audience_scope)
        redis_client = cache.redis if cache.is_redis_available and cache.redis else None
        stats: dict[int, dict[str, int | None]] = {}

        try:
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
        except SessionStateStoreError as e:
            logger.error("Failed to list online users because session state is unavailable: %s", e)
            IdentityService._raise_session_state_unavailable()

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
        try:
            target_audiences = IdentityService._resolve_audiences(audience_scope)
            for audience in target_audiences:
                revoked_sessions += await IdentityService._revoke_all_sessions_for_user(
                    user_id=current_user.id,
                    audience=audience,
                )

            # Ensure current request token/cookies are also denylisted, even if issued before ZSET tracking.
            for token in IdentityService._collect_request_tokens(request):
                await IdentityService._revoke_token(token, db=db)
        except SessionStateStoreError as e:
            logger.error(
                "Failed to revoke all sessions for user_id=%s audience_scope=%s: %s",
                current_user.id,
                audience_scope,
                e,
            )
            IdentityService._raise_session_state_unavailable()

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
        import modules.models as models
        from iam.audit.service import IAMAuditService

        result = await db.execute(select(models.User).filter(models.User.id == target_user_id))
        target_user = result.scalars().first()
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        revoked_sessions = 0
        try:
            target_audiences = IdentityService._resolve_audiences(audience_scope)
            for audience in target_audiences:
                revoked_sessions += await IdentityService._revoke_all_sessions_for_user(
                    user_id=target_user.id,
                    audience=audience,
                )
        except SessionStateStoreError as e:
            logger.error(
                "Failed to revoke sessions for target_user_id=%s audience_scope=%s: %s",
                target_user.id,
                audience_scope,
                e,
            )
            IdentityService._raise_session_state_unavailable()

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
