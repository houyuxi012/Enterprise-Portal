from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict
import os
import database
import models
from dependencies import PermissionChecker
from fastapi import Request
from services.audit_service import AuditService
from services.loki_config import update_loki_retention
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/system",
    tags=["system"],
)

@router.get("/config", response_model=Dict[str, str])
async def get_system_config(
    db: AsyncSession = Depends(database.get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view"))
):
    result = await db.execute(select(models.SystemConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}

@router.post("/config", response_model=Dict[str, str])
async def update_system_config(
    request: Request,
    config: Dict[str, str], 
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit"))
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
    
    # Sync Loki retention if access log retention is updated
    if "log_retention_access_days" in config:
        try:
            retention_days = int(config["log_retention_access_days"])
            if update_loki_retention(retention_days):
                logger.info(f"Loki retention synced to {retention_days} days")
            else:
                logger.warning("Loki retention sync failed - config may not be mounted")
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid access log retention value: {e}")
    
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
async def get_system_info(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view"))
):
    """
    Get system version and status information.
    """
    try:
        # Check DB connection
        await db.execute(select(1))
        db_status = "已连接"
    except Exception:
        db_status = "连接失败"

    configured_public_base = os.getenv("PORTAL_PUBLIC_BASE_URL", "").strip()
    if configured_public_base:
        access_address = configured_public_base.rstrip("/")
    else:
        # For zero-trust deployments, avoid reflecting arbitrary Host header values.
        host = request.url.hostname or ""
        access_address = str(request.base_url).rstrip("/") if host in {"localhost", "127.0.0.1"} else "未配置"

    return {
        "software_name": "Next-Gen Enterprise Portal",
        "version": "2.5.0", # Updated version
        "status": "运行中",
        "database": db_status,
        "license_id": "EP-2026-X892-L7",
        "authorized_unit": "ShiKu Inc.",
        "access_address": access_address,
        "environment": "生产环境",
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
async def get_system_resources(
    _: models.User = Depends(PermissionChecker("sys:settings:view"))
):
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
async def get_storage_stats(_: models.User = Depends(PermissionChecker("sys:settings:view"))):
    """
    Get storage usage statistics from MinIO or Local storage.
    Returns: used_bytes, total_bytes, free_bytes, used_percent, bucket_count, object_count.
    """
    return storage.get_stats()


@router.post("/optimize-storage")
async def optimize_storage(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit"))
):
    """
    Trigger immediate log cleanup + database optimization.
    """
    from services.log_storage import cleanup_logs, optimize_database

    await cleanup_logs(database.SessionLocal)
    optimize_ok = await optimize_database(database.SessionLocal, database.engine)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="OPTIMIZE_STORAGE",
        target="日志与数据库",
        detail=f"optimize_database_success={optimize_ok}",
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return {
        "ok": optimize_ok,
        "message": "Storage optimization completed" if optimize_ok else "Storage cleanup completed, database optimize partially failed"
    }
