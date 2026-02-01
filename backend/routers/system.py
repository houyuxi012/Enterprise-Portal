from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict
import database
import models
from routers.auth import get_current_user
from dependencies import PermissionChecker
from fastapi import Request
from services.audit_service import AuditService
import uuid

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
    request: Request,
    config: Dict[str, str], 
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
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
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_SYSTEM_CONFIG", 
        target="系统配置", 
        detail=f"Updated keys: {', '.join(config.keys())}",
        ip_address=ip,
        trace_id=trace_id
    )

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

# --- System Resources ---
import psutil
import time
import schemas

# Simple state for network speed calculation
_last_net_io = None
_last_net_time = None

@router.get("/resources", response_model=schemas.SystemResources)
async def get_system_resources():
    global _last_net_io, _last_net_time
    
    # 1. CPU
    cpu_percent = psutil.cpu_percent(interval=None) # Non-blocking
    
    # 2. Memory
    mem = psutil.virtual_memory()
    mem_percent = mem.percent
    mem_used = f"{mem.used / (1024**3):.1f}GB"
    mem_total = f"{mem.total / (1024**3):.0f}GB"
    
    # 3. Disk
    disk = psutil.disk_usage('/')
    disk_percent = disk.percent
    
    # 4. Network Speed Calculation
    net_io = psutil.net_io_counters()
    current_time = time.time()
    
    sent_speed = 0.0
    recv_speed = 0.0
    
    if _last_net_io and _last_net_time:
        time_delta = current_time - _last_net_time
        if time_delta > 0:
            bytes_sent_delta = net_io.bytes_sent - _last_net_io.bytes_sent
            bytes_recv_delta = net_io.bytes_recv - _last_net_io.bytes_recv
            
            # Convert to MB/s
            sent_speed = (bytes_sent_delta / time_delta) / (1024 * 1024)
            recv_speed = (bytes_recv_delta / time_delta) / (1024 * 1024)
    
    # Update state
    _last_net_io = net_io
    _last_net_time = current_time
    
    return schemas.SystemResources(
        cpu_percent=cpu_percent,
        memory_percent=mem_percent,
        memory_used=mem_used,
        memory_total=mem_total,
        disk_percent=disk_percent,
        network_sent_speed=round(sent_speed, 2),
        network_recv_speed=round(recv_speed, 2)
    )

from services.storage import storage

@router.get("/storage")
async def get_storage_stats(current_user: models.User = Depends(get_current_user)):
    """
    Get storage usage statistics from MinIO or Local storage.
    Returns: used_bytes, total_bytes, free_bytes, used_percent, bucket_count, object_count.
    """
    return storage.get_stats()


