from typing import Dict, Set

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models

router = APIRouter(prefix="/public", tags=["public"])

# Public-safe configuration keys for pre-login screens and portal branding.
PUBLIC_CONFIG_KEYS: Set[str] = {
    "app_name",
    "logo_url",
    "footer_text",
    "browser_title",
    "favicon_url",
    "privacy_policy",
    "ai_name",
    "ai_icon",
    "ai_enabled",
    "search_ai_enabled",
    "kb_enabled",
    "default_ai_model",
}


@router.get("/config", response_model=Dict[str, str])
async def get_public_config(
    db: AsyncSession = Depends(database.get_db),
):
    result = await db.execute(
        select(models.SystemConfig).where(models.SystemConfig.key.in_(PUBLIC_CONFIG_KEYS))
    )
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}
