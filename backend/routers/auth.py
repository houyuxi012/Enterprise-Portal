from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models, utils, schemas
from sqlalchemy import select
from datetime import timedelta
from jose import JWTError, jwt
from services.audit_service import AuditService

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@router.post("/token")
async def login_for_access_token(
    request: Request, # Added to get IP
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(models.User).filter(models.User.username == form_data.username))
    user = result.scalars().first()
    
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    trace_id = request.headers.get("X-Request-ID")

    # --- Security Logic Start ---
    from datetime import datetime, timezone
    import ipaddress

    # Fetch System Config once for all security checks
    # Optimization: Loading config every login is acceptable for now. Caching would be better later.
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
                # Client IP invalid?
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
                    headers={"WWW-Authenticate": "Bearer"},
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
                headers={"WWW-Authenticate": "Bearer"},
            )
        else:
            # Auto unlock
            user.locked_until = None
            user.failed_attempts = 0
            db.add(user)
            await db.commit()

    if not user or not utils.verify_password(form_data.password, user.hashed_password):
        # 2. Handle configuration and failure
        if user:
            # Configs already fetched
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
        
    # Capture username before commit in log_business_action expires the object
    username = user.username
    user_id = user.id
    
    # 3. Reset on success
    if user.failed_attempts > 0 or user.locked_until is not None:
        user.failed_attempts = 0
        user.locked_until = None
        db.add(user)
        # Commit will handle by context or explicit? 
        # AuditService.log_login might commit implicitly if it uses the same session transaction? 
        # Ideally we commit the user reset.
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
    return {"access_token": access_token, "token_type": "bearer"}

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
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
