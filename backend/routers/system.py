from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict
import database
import models
from routers.auth import get_current_user
from dependencies import PermissionChecker

router = APIRouter(
    prefix="/system",
    tags=["system"],
)

@router.get("/config", response_model=Dict[str, str])
async def get_system_config(db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.SystemConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}

@router.post("/config", response_model=Dict[str, str], dependencies=[Depends(PermissionChecker("sys:settings:edit"))])
async def update_system_config(
    config: Dict[str, str], 
    db: AsyncSession = Depends(database.get_db)
):
    # Permission checked by dependency
    
    for key, value in config.items():
        result = await db.execute(select(models.SystemConfig).filter(models.SystemConfig.key == key))
        existing = result.scalars().first()
        
        if existing:
            existing.value = value
        else:
            new_config = models.SystemConfig(key=key, value=value)
            db.add(new_config)
    
    await db.commit()
    
    # Return updated configs
    result = await db.execute(select(models.SystemConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}

@router.get("/info")
async def get_system_info(db: AsyncSession = Depends(database.get_db)):
    """
    Get system version and status information.
    """
    try:
        # Check DB connection
        await db.execute(select(1))
        db_status = "已连接"
    except Exception:
        db_status = "连接失败"
        
    return {
        "version": "1.0.0",
        "status": "运行中",
        "database": db_status,
        "environment": "生产环境", # Could be fetched from env vars
        "copyright": "© 2026 ShiKu Inc. All rights reserved."
    }
