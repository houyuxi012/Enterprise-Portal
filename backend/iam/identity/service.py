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
from jose import JWTError, jwt

logger = logging.getLogger(__name__)


class IdentityService:
    """身份认证服务"""
    
    @staticmethod
    async def get_current_user(request: Request, db: AsyncSession):
        """从 Cookie/Header 解析当前用户"""
        import utils
        import models
        
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
        token = request.cookies.get("access_token")
        if not token:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
            else:
                raise credentials_exception
        
        try:
            payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                raise credentials_exception
        except JWTError:
            raise credentials_exception
        
        from sqlalchemy.orm import selectinload
        result = await db.execute(select(models.User).filter(models.User.username == username).options(selectinload(models.User.roles)))
        user = result.scalars().first()
        if user is None or not user.is_active:
            raise credentials_exception
        return user
    
    @staticmethod
    async def login(
        request: Request,
        response: Response,
        form_data: OAuth2PasswordRequestForm,
        db: AsyncSession
    ) -> dict:
        """登录核心逻辑"""
        import utils
        import models
        from iam.audit.service import IAMAuditService
        
        result = await db.execute(select(models.User).filter(models.User.username == form_data.username))
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

        # Disabled accounts are not allowed to establish sessions.
        if not user.is_active:
            await IAMAuditService.log_login(
                db,
                username=form_data.username,
                success=False,
                ip_address=ip,
                user_agent=user_agent,
                user_id=user.id,
                reason="Account disabled",
                trace_id=trace_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is disabled.",
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
        access_token = utils.create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )
        
        response.set_cookie(
            key="access_token",
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
    async def logout(
        response: Response,
        request: Request | None = None,
        db: AsyncSession | None = None
    ) -> dict:
        """登出核心逻辑"""
        import utils
        from iam.audit.service import IAMAuditService

        if request and db:
            try:
                current_user = await IdentityService.get_current_user(request, db)
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
            except HTTPException:
                # Logout should still succeed even if token is already invalid.
                pass
            except Exception as e:
                logger.warning("Failed to write logout audit log: %s", e)
        
        response.delete_cookie(
            key="access_token",
            path="/",
            domain=utils.COOKIE_DOMAIN,
            secure=utils.COOKIE_SECURE,
            samesite=utils.COOKIE_SAMESITE
        )
        return {"message": "Logout successful"}
