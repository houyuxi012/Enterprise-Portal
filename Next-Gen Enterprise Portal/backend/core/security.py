from datetime import datetime, timedelta, timezone
import os
from uuid import uuid4

import anyio
import jwt
from passlib.context import CryptContext

from core.runtime_secrets import bootstrap_process_secrets, get_required_env

bootstrap_process_secrets()

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))  # Default 30 minutes
ALGORITHM = "HS256"

# Security Configuration
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "False").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")  # 'lax', 'strict', 'none'
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", None)  # e.g. '.example.com' or None for localhost
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_jwt_secret() -> str:
    return get_required_env("SECRET_KEY")


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    return await anyio.to_thread.run_sync(
        pwd_context.verify,
        plain_password,
        hashed_password,
    )


async def get_password_hash(password: str) -> str:
    return await anyio.to_thread.run_sync(
        pwd_context.hash,
        password,
    )


def create_access_token(data: dict, expires_delta: timedelta | None = None, audience: str | None = None) -> str:
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
    encoded_jwt = jwt.encode(to_encode, get_jwt_secret(), algorithm=ALGORITHM)
    return encoded_jwt
