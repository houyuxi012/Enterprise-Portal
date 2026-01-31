
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
import models
import schemas
from database import get_db
from routers.auth import get_current_user
import datetime

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    responses={404: {"description": "Not found"}},
)

# --- System Logs ---

@router.get("/system", response_model=List[schemas.SystemLog])
async def read_system_logs(
    level: Optional[str] = None,
    module: Optional[str] = None,
    exclude_module: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = select(models.SystemLog).order_by(desc(models.SystemLog.id))
    if level:
        query = query.filter(models.SystemLog.level == level)
    if module:
        query = query.filter(models.SystemLog.module == module)
    if exclude_module:
        query = query.filter(models.SystemLog.module != exclude_module)
    
    result = await db.execute(query.limit(limit).offset(offset))
    return result.scalars().all()

# --- Business Logs ---

@router.get("/business", response_model=List[schemas.BusinessLog])
async def read_business_logs(
    operator: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = select(models.BusinessLog).order_by(desc(models.BusinessLog.id))
    if operator:
        query = query.filter(models.BusinessLog.operator.contains(operator))
    if action:
        query = query.filter(models.BusinessLog.action == action)
        
    result = await db.execute(query.limit(limit).offset(offset))
    return result.scalars().all()

@router.post("/business", response_model=schemas.BusinessLog)
async def create_business_log(
    log: schemas.BusinessLogCreate,
    db: AsyncSession = Depends(get_db),
    # Allowing internal calls or authenticated users to log actions
    current_user: models.User = Depends(get_current_user) 
):
    db_log = models.BusinessLog(**log.dict())
    db.add(db_log)
    await db.commit()
    await db.refresh(db_log)
    return db_log

# --- Log Forwarding ---

@router.get("/config", response_model=List[schemas.LogForwardingConfig])
async def read_log_configs(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.LogForwardingConfig))
    return result.scalars().all()

@router.post("/config", response_model=schemas.LogForwardingConfig)
async def create_log_config(
    config: schemas.LogForwardingConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_config = models.LogForwardingConfig(**config.dict())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.delete("/config/{config_id}")
async def delete_log_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.LogForwardingConfig).filter(models.LogForwardingConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    await db.delete(db_config)
    await db.commit()
    return {"message": "Config deleted"}
