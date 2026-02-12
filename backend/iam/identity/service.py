"""
Identity Service - 认证核心逻辑
"""
import logging
from datetime import datetime, timezone, timedelta
import ipaddress
from fastapi import Request, Response, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from jose import JWTError, jwt

logger = logging.getLogger(__name__)


class IdentityService:
    """身份认证服务"""

    ACCOUNT_TYPE_SYSTEM = "SYSTEM"
    ACCOUNT_TYPE_PORTAL = "PORTAL"
    REVOKED_JTI_PREFIX = "iam:revoked:jti:"

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
    async def _revoke_token(token: str | None):
        if not token:
            return
        import utils
        from services.cache_manager import cache

        try:
            payload = jwt.decode(
                token,
                utils.SECRET_KEY,
                algorithms=[utils.ALGORITHM],
                options={"verify_aud": False, "verify_exp": False},
            )
        except JWTError:
            return

        jti = payload.get("jti")
        exp_ts = IdentityService._exp_to_epoch(payload.get("exp"))
        if not jti or exp_ts is None:
            return

        ttl = max(1, exp_ts - int(datetime.now(timezone.utc).timestamp()))
        try:
            await cache.set(
                IdentityService._revoked_jti_cache_key(jti),
                "1",
                ttl=ttl,
                is_json=False,
            )
        except Exception as e:
            logger.warning("Failed to add token jti=%s into denylist: %s", jti, e)
    
    @staticmethod
    async def get_current_user(request: Request, db: AsyncSession, audience: str = None):
        """从 Cookie/Header 解析当前用户"""
        import utils
        import models
        
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
        # Infer audience from route space if caller didn't provide one.
        if audience is None:
            path = request.url.path or ""
            if path.startswith("/api/admin/"):
                audience = "admin"
            elif path.startswith("/api/app/"):
                audience = "portal"

        # Strict cookie isolation when audience is explicitly required.
        token = None
        if audience == "admin":
            token = request.cookies.get("admin_session")
            if not token:
                raise credentials_exception
        elif audience == "portal":
            token = request.cookies.get("portal_session")
            if not token:
                raise credentials_exception
        else:
            # Legacy/global auth fallback for endpoints that don't lock to one audience.
            token = request.cookies.get("admin_session") or request.cookies.get("portal_session")
            if not token:
                token = request.cookies.get("access_token")
            if not token:
                auth_header = request.headers.get("Authorization")
                if auth_header and auth_header.startswith("Bearer "):
                    token = auth_header.split(" ")[1]
                else:
                    raise credentials_exception
        
        try:
            # Decode with audience verification if audience is specified
            options = {"verify_aud": True} if audience else {"verify_aud": False}
            payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM], audience=audience, options=options)
            username: str = payload.get("sub")
            if username is None:
                raise credentials_exception
            token_jti: str | None = payload.get("jti")
            if await IdentityService._is_jti_revoked(token_jti):
                raise credentials_exception
        except JWTError:
            raise credentials_exception
        
        result = await db.execute(select(models.User).filter(models.User.username == username).options(selectinload(models.User.roles).selectinload(models.Role.permissions)))
        user = result.scalars().first()
        if user is None or not user.is_active:
            raise credentials_exception
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

        # Fetch System Config
        config_result = await db.execute(select(models.SystemConfig))
        configs = {c.key: c.value for c in config_result.scalars().all()}
        
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

        # Check if user is locked
        if user and user.locked_until:
            if user.locked_until > datetime.now(timezone.utc):
                await IAMAuditService.log_login(
                    db, username=form_data.username, success=False,
                    ip_address=ip, user_agent=user_agent, reason="Account locked", trace_id=trace_id
                )
                await db.commit()
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is locked. Please try again later.")
            else:
                user.locked_until = None
                user.failed_attempts = 0
                db.add(user)
                await db.commit()

        # Password Verification
        if not user or not utils.verify_password(form_data.password, user.hashed_password):
            if user:
                max_retries = int(configs.get("security_login_max_retries", 5))
                lockout_duration = int(configs.get("security_lockout_duration", 15))
                
                user.failed_attempts = (user.failed_attempts or 0) + 1
                
                if user.failed_attempts >= max_retries:
                    user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=lockout_duration)
                    reason_msg = f"Account locked after {user.failed_attempts} failed attempts"
                else:
                    reason_msg = "Incorrect username or password"
                    
                db.add(user)
                await db.commit()
            else:
                reason_msg = "Incorrect username or password"

            await IAMAuditService.log_login(
                db, username=form_data.username, success=False,
                ip_address=ip, user_agent=user_agent, reason=reason_msg, trace_id=trace_id
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

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
        
        # Reset on success
        if user.failed_attempts > 0 or user.locked_until is not None:
            user.failed_attempts = 0
            user.locked_until = None
            db.add(user)
            await db.commit()

        # Log success
        await IAMAuditService.log_login(
            db, username=username, success=True,
            ip_address=ip, user_agent=user_agent, user_id=user_id, trace_id=trace_id
        )
        await db.commit()

        access_token_expires = timedelta(minutes=utils.ACCESS_TOKEN_EXPIRE_MINUTES)
        previous_token = request.cookies.get(cookie_name)
        if previous_token:
            # Rotate same-audience session token on login to limit concurrent stale token reuse.
            await IdentityService._revoke_token(previous_token)
        # Issue token with Audience
        access_token = utils.create_access_token(
            data={"sub": username}, expires_delta=access_token_expires, audience=audience
        )
        
        response.set_cookie(
            key=cookie_name,
            value=access_token,
            httponly=True,
            max_age=utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            expires=utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
    async def logout(
        response: Response,
        request: Request | None = None,
        db: AsyncSession | None = None
    ) -> dict:
        """登出核心逻辑 - Clears all sessions"""
        import utils
        from iam.audit.service import IAMAuditService

        if request and db:
            try:
                # Try getting user from either session
                current_user = None
                try:
                    current_user = await IdentityService.get_current_user(request, db, audience="admin")
                except:
                    pass
                
                if not current_user:
                    try:
                        current_user = await IdentityService.get_current_user(request, db, audience="portal")
                    except:
                        pass

                if current_user:
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

        if request:
            await IdentityService._revoke_token(request.cookies.get("access_token"))
            await IdentityService._revoke_token(request.cookies.get("portal_session"))
            await IdentityService._revoke_token(request.cookies.get("admin_session"))
        
        # Clear ALL potential cookies
        response.delete_cookie(key="access_token", path="/", domain=utils.COOKIE_DOMAIN, secure=utils.COOKIE_SECURE, samesite=utils.COOKIE_SAMESITE)
        response.delete_cookie(key="portal_session", path="/", domain=utils.COOKIE_DOMAIN, secure=utils.COOKIE_SECURE, samesite=utils.COOKIE_SAMESITE)
        response.delete_cookie(key="admin_session", path="/", domain=utils.COOKIE_DOMAIN, secure=utils.COOKIE_SECURE, samesite=utils.COOKIE_SAMESITE)
        
        return {"message": "Logout successful"}
