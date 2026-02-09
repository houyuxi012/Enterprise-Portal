"""
IAM Auth 路由
/iam/auth/token, /iam/auth/logout, /iam/auth/me
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
import models, utils, schemas
from datetime import timedelta, datetime, timezone
from jose import JWTError, jwt
import ipaddress
from services.audit_service import AuditService
from services.iam_cache import iam_cache

router = APIRouter(prefix="/auth", tags=["iam-auth"])


# ========== Token Handler ==========
async def login_handler(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm,
    db: AsyncSession
):
    """核心登录逻辑，供新旧路由复用"""
    
    # Retrieve user
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
                await AuditService.log_login(
                    db, username=form_data.username, success=False,
                    ip_address=ip, user_agent=user_agent, reason="IP not allowed", trace_id=trace_id
                )
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access denied from this IP address.")

    # Check if user is locked
    if user and user.locked_until:
        if user.locked_until > datetime.now(timezone.utc):
            await AuditService.log_login(
                db, username=form_data.username, success=False,
                ip_address=ip, user_agent=user_agent, reason="Account locked", trace_id=trace_id
            )
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

        await AuditService.log_login(
            db, username=form_data.username, success=False,
            ip_address=ip, user_agent=user_agent, reason=reason_msg, trace_id=trace_id
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
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
    await AuditService.log_login(
        db, username=username, success=True,
        ip_address=ip, user_agent=user_agent, user_id=user_id, trace_id=trace_id
    )
    
    await AuditService.log_business_action(
        db, user_id=user_id, username=username,
        action="用户登录", target=f"用户 {username}",
        ip_address=ip, trace_id=trace_id
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
    
    return {"message": "Login successful", "token_type": "bearer"}


# ========== Logout Handler ==========
async def logout_handler(response: Response):
    """核心登出逻辑"""
    from iam.identity.service import IdentityService
    return await IdentityService.logout(response)


# ========== Me Handler ==========
async def me_handler(request: Request, db: AsyncSession) -> schemas.UserMeResponse:
    """获取当前用户信息（含权限集 + 版本号）"""
    from routers.auth import get_current_user
    
    user = await get_current_user(request, db)
    
    # 从 IAM 缓存获取权限
    roles, permissions_set, perm_version = await iam_cache.get_user_permissions(user.id, db)
    
    return schemas.UserMeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        is_active=user.is_active,
        roles=[schemas.RoleOut(**r) for r in roles],
        permissions=list(permissions_set),
        perm_version=perm_version
    )


# ========== Route Endpoints ==========
@router.post("/token")
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    return await login_handler(request, response, form_data, db)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    from iam.identity.service import IdentityService
    return await IdentityService.logout(response, request=request, db=db)


@router.get("/me", response_model=schemas.UserMeResponse)
async def get_current_user_info(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    return await me_handler(request, db)
