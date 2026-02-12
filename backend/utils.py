from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, timezone
import os
from uuid import uuid4

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 8)) # Default 8 hours
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-change-this-in-env")
ALGORITHM = "HS256"

# Security Configuration
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "False").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax") # 'lax', 'strict', 'none'
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", None) # e.g. '.example.com' or None for localhost
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None, audience: str | None = None):
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": to_encode.get("jti") or str(uuid4()),
    })
    if audience:
        to_encode.update({"aud": audience})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Logger Helper ---
import models
from sqlalchemy.ext.asyncio import AsyncSession

async def log_business_action(
    db: AsyncSession,
    operator: str,
    action: str,
    target: str | None = None,
    status: str = "SUCCESS",
    detail: str | None = None,
    ip_address: str | None = None
):
    """
    Helper to create a business log entry asynchronously.
    """
    try:
        log = models.BusinessLog(
            operator=operator,
            action=action,
            target=target,
            status=status,
            detail=detail,
            ip_address=ip_address,
            timestamp=datetime.now().isoformat()
        )
        db.add(log)
        # We assume the caller handles the transaction commit if they are in the middle of one,
        # but for logging we usually want immediate persistence. 
        # However, to be safe with ongoing transactions allow simple add.
        # But here we want to ensure it's saved.
        # If the caller is using the session for other things, creating a nested transaction or separate session might be safer?
        # For simplicity in this project, we'll just add it to the current session.
        # If the main transaction fails, the log might roll back, which is often acceptable (action didn't happen).
        # For Login (auth), it's a dedicated request.
        
        # To ensure logs persist even if main action fails (e.g. for ERROR logs), we might need a separate session, 
        # but we are passing 'db' here.
        # Let's trust the caller to commit, or we commit if it's a standalone log.
        # Actually for 'auth', we return immediately, so we should commit.
        # For 'users', we assume successful action = successful log.
        
        # We will NOT commit here to avoid breaking caller's atomicity, unless we want to force it.
        # Better: caller commits. 
        # BUT for Login, there is no other DB write. So we need to commit.
        # Let's make it optional? Or just let caller handle it. 
        # Let's safe-guard:
        await db.commit() 
    except Exception as e:
        print(f"Failed to write business log: {e}")
