from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models, utils, schemas
from sqlalchemy import select
from datetime import timedelta
from jose import JWTError, jwt
from services.audit_service import AuditService
from services.crypto_service import CryptoService

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")



@router.post("/token")
async def login_for_access_token(
    request: Request,
    response: Response, 
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    # Retrieve user (logic unchanged)
    result = await db.execute(select(models.User).filter(models.User.username == form_data.username))
    user = result.scalars().first()
    
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    trace_id = request.headers.get("X-Request-ID")

    # --- Security Logic Start ---
    from datetime import datetime, timezone
    import ipaddress

    # Fetch System Config once for all security checks
    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    
    # 0. IP Allowlist Check
    ip_allowlist_str = configs.get("security_ip_allowlist", "")
    if ip_allowlist_str:
        allowed_cidrs = [cidr.strip() for cidr in ip_allowlist_str.split(',') if cidr.strip()]
        if allowed_cidrs:
            client_ip = ip
            is_allowed = False
            try:
                # Handle potential IPv6 mapped IPv4 or just standard parsing
                client_ip_obj = ipaddress.ip_address(client_ip)
                for cidr in allowed_cidrs:
                    try:
                        if client_ip_obj in ipaddress.ip_network(cidr, strict=False):
                            is_allowed = True
                            break
                    except ValueError:
                        continue # Ignore invalid config entries
            except ValueError:
                pass
            
            if not is_allowed:
                await AuditService.log_login(
                    db,
                    username=form_data.username,
                    success=False,
                    ip_address=ip,
                    user_agent=user_agent,
                    reason="IP not allowed",
                    trace_id=trace_id
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Access denied from this IP address.",
                )

    # 1. Check if user is locked
    if user and user.locked_until:
        if user.locked_until > datetime.now(timezone.utc):
            await AuditService.log_login(
                db,
                username=form_data.username,
                success=False,
                ip_address=ip,
                user_agent=user_agent,
                reason="Account locked",
                trace_id=trace_id
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Account is locked. Please try again later.",
            )
        else:
            # Auto unlock
            user.locked_until = None
            user.failed_attempts = 0
            db.add(user)
            await db.commit()

    # Password Verification (Plain text now, handled by HTTPS)
    # Note: Frontend encryption removed in this phase, so we expect plain password.
    # We still check verifies against hashed_password.
    if not user or not utils.verify_password(form_data.password, user.hashed_password):
        # 2. Handle configuration and failure
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

        # Log failure
        await AuditService.log_login(
            db,
            username=form_data.username,
            success=False,
            ip_address=ip,
            user_agent=user_agent,
            reason=reason_msg,
            trace_id=trace_id
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Capture username before commit
    username = user.username
    user_id = user.id
    
    # 3. Reset on success
    if user.failed_attempts > 0 or user.locked_until is not None:
        user.failed_attempts = 0
        user.locked_until = None
        db.add(user)
        await db.commit()

    # Log success
    await AuditService.log_login(
        db,
        username=username,
        success=True,
        ip_address=ip,
        user_agent=user_agent,
        user_id=user_id,
        trace_id=trace_id
    )

    access_token_expires = timedelta(minutes=utils.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = utils.create_access_token(
        data={"sub": username}, expires_delta=access_token_expires
    )
    
    # Set Strict HttpOnly Cookie (Raw JWT)
    response.set_cookie(
        key="access_token",
        value=access_token, # Raw JWT, no Bearer prefix
        httponly=True,
        max_age=utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=utils.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite=utils.COOKIE_SAMESITE, 
        secure=utils.COOKIE_SECURE,
        domain=utils.COOKIE_DOMAIN,
        path="/"
    )
    
    return {"message": "Login successful", "token_type": "bearer"}

@router.post("/logout")
async def logout(response: Response):
    # Must match creation params exactly to delete
    response.delete_cookie(
        key="access_token", 
        path="/", 
        domain=utils.COOKIE_DOMAIN, 
        secure=utils.COOKIE_SECURE, 
        samesite=utils.COOKIE_SAMESITE
    )
    return {"message": "Logout successful"}

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = request.cookies.get("access_token")
    if not token:
        # Fallback (optional, mostly for API clients who might still send header)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        else:
            raise credentials_exception
            
    # Token is now raw JWT (whether from cookie or header split)

    try:
        payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    result = await db.execute(select(models.User).filter(models.User.username == username))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user
