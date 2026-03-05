"""IAM authentication helper functions shared by routers/services."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from infrastructure.cache_manager import cache
import modules.models as models
import utils

MFA_TOKEN_EXPIRE_MINUTES = 5


async def get_system_mfa_config(db: AsyncSession) -> bool:
    """Check if system-level force MFA is enabled."""
    result = await db.execute(
        select(models.SystemConfig).filter(models.SystemConfig.key == "security_mfa_enabled")
    )
    config = result.scalars().first()
    return config is not None and str(config.value).lower() == "true"


def create_mfa_token(user: models.User, provider: str = "local") -> str:
    """Issue a short-lived JWT for MFA challenge (not usable as session)."""
    return utils.create_access_token(
        data={"sub": user.username, "uid": user.id, "provider": provider},
        expires_delta=timedelta(minutes=MFA_TOKEN_EXPIRE_MINUTES),
        audience="mfa_challenge",
    )


async def verify_captcha(captcha_id: str, captcha_code: str) -> bool:
    """Verify and consume captcha code from cache."""
    if not captcha_id or not captcha_code:
        return False

    stored_code = await cache.get(f"captcha:{captcha_id}", is_json=False)
    if not stored_code:
        return False

    await cache.delete(f"captcha:{captcha_id}")

    if isinstance(stored_code, bytes):
        stored_code = stored_code.decode("utf-8")

    return str(stored_code).lower() == str(captcha_code).lower()

