import json
import logging
import os
import time
from pathlib import Path
from typing import Dict

import psutil
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
import schemas
from dependencies import PermissionChecker
from services.audit_service import AuditService
from services.loki_config import update_loki_retention
from services.storage import storage

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/system",
    tags=["system"],
)

VERSION_DEFAULTS = {
    "product": "Next-Gen Enterprise Portal",
    "product_id": "enterprise-portal",
    "version": "dev",
    "semver": "0.0.0",
    "channel": "dev",
    "git_sha": "unknown",
    "dirty": False,
    "build_time": "unknown",
    "build_number": "0",
    "build_id": "unknown",
    "release_id": "unknown",
    "api_version": "v1",
    "db_schema_version": "1.0.0",
}

# Simple state for network speed calculation
_last_net_io = None
_last_net_time = None


def _load_version_info() -> Dict:
    """Load build metadata from VERSION.json with safe defaults."""
    version_file = Path("VERSION.json")
    if not version_file.exists():
        logger.warning("VERSION.json not found, returning dev defaults")
        return VERSION_DEFAULTS.copy()

    try:
        with version_file.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        logger.error("Failed to read VERSION.json: %s", e)
        return VERSION_DEFAULTS.copy()

    # Merge with defaults to ensure all keys exist
    return {**VERSION_DEFAULTS, **payload}


async def check_version_upgrade(_session_factory):
    """
    Reserved startup hook for future online version checks.
    Keep as a no-op to avoid startup import failures in `main.py`.
    """
    return None


@router.get("/config", response_model=Dict[str, str])
async def get_system_config(
    db: AsyncSession = Depends(database.get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    result = await db.execute(select(models.SystemConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}


@router.post("/config", response_model=Dict[str, str])
async def update_system_config(
    request: Request,
    config: Dict[str, str],
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    for key, value in config.items():
        result = await db.execute(
            select(models.SystemConfig).filter(models.SystemConfig.key == key)
        )
        existing = result.scalars().first()

        if existing:
            existing.value = value
        else:
            db.add(models.SystemConfig(key=key, value=value))

    # Sync Loki retention if access log retention is updated
    if "log_retention_access_days" in config:
        try:
            retention_days = int(config["log_retention_access_days"])
            if update_loki_retention(retention_days):
                logger.info("Loki retention synced to %s days", retention_days)
            else:
                logger.warning("Loki retention sync failed - config may not be mounted")
        except (ValueError, TypeError) as e:
            logger.error("Invalid access log retention value: %s", e)

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
        trace_id=trace_id,
    )

    await db.commit()

    result = await db.execute(select(models.SystemConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}


@router.get("/info")
async def get_system_info(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    """Get system version and status information."""
    try:
        await db.execute(select(1))
        db_status = "已连接"
    except Exception:
        db_status = "连接失败"

    configured_public_base = os.getenv("PORTAL_PUBLIC_BASE_URL", "").strip()
    if configured_public_base:
        access_address = configured_public_base.rstrip("/")
    else:
        # Zero-trust safety: do not reflect arbitrary host headers.
        host = request.url.hostname or ""
        if host in {"localhost", "127.0.0.1"}:
            access_address = str(request.base_url).rstrip("/")
        else:
            access_address = "未配置"

    version_info = _load_version_info()
    return {
        "software_name": version_info["product"],
        "product_id": version_info.get("product_id", "enterprise-portal"),
        "version": version_info["version"],
        "status": "运行中",
        "database": db_status,
        "license_id": "EP-2026-X892-L7",
        "authorized_unit": "ShiKu Inc.",
        "access_address": access_address,
        "environment": "生产环境",
        "copyright": "© 2026 ShiKu Inc. All rights reserved.",
        "git_sha": version_info["git_sha"],
        "dirty": version_info.get("dirty", False),
        "build_time": version_info["build_time"],
        "build_id": version_info.get("build_id", "unknown"),
        "release_id": version_info.get("release_id", "unknown"),
        "channel": version_info.get("channel", "dev"),
        "semver": version_info.get("semver", "0.0.0"),
        "api_version": version_info.get("api_version", "v1"),
    }


@router.get("/version", response_model=Dict[str, str | bool])
async def get_system_version(
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    """Compatibility endpoint used by frontend version widget."""
    version_info = _load_version_info()
    return {
        "product": version_info["product"],
        "product_id": version_info.get("product_id", "enterprise-portal"),
        "version": version_info["version"],
        "semver": version_info.get("semver", "0.0.0"),
        "channel": version_info.get("channel", "dev"),
        "git_sha": version_info.get("git_sha", "unknown"),
        "dirty": version_info.get("dirty", False),
        "build_time": version_info.get("build_time", "unknown"),
        "build_number": version_info.get("build_number", "0"),
        "build_id": version_info.get("build_id", "unknown"),
        "release_id": version_info.get("release_id", "unknown"),
        "api_version": version_info.get("api_version", "v1"),
        "db_schema_version": version_info.get("db_schema_version", "1.0.0"),
    }


@router.get("/resources", response_model=schemas.SystemResources)
async def get_system_resources(
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    global _last_net_io, _last_net_time

    cpu_percent = psutil.cpu_percent(interval=None)

    mem = psutil.virtual_memory()
    mem_percent = mem.percent
    mem_used = f"{mem.used / (1024 ** 3):.1f}GB"
    mem_total = f"{mem.total / (1024 ** 3):.0f}GB"

    disk = psutil.disk_usage("/")
    disk_percent = disk.percent

    net_io = psutil.net_io_counters()
    current_time = time.time()

    sent_speed = 0.0
    recv_speed = 0.0

    if _last_net_io and _last_net_time:
        time_delta = current_time - _last_net_time
        if time_delta > 0:
            bytes_sent_delta = net_io.bytes_sent - _last_net_io.bytes_sent
            bytes_recv_delta = net_io.bytes_recv - _last_net_io.bytes_recv
            sent_speed = (bytes_sent_delta / time_delta) / (1024 * 1024)
            recv_speed = (bytes_recv_delta / time_delta) / (1024 * 1024)

    _last_net_io = net_io
    _last_net_time = current_time

    return schemas.SystemResources(
        cpu_percent=cpu_percent,
        memory_percent=mem_percent,
        memory_used=mem_used,
        memory_total=mem_total,
        disk_percent=disk_percent,
        network_sent_speed=round(sent_speed, 2),
        network_recv_speed=round(recv_speed, 2),
    )


@router.get("/storage")
async def get_storage_stats(
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    """
    Get storage usage statistics from MinIO or Local storage.
    Returns: used_bytes, total_bytes, free_bytes, used_percent, bucket_count, object_count.
    """
    return storage.get_stats()


@router.post("/optimize-storage")
async def optimize_storage(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    """Trigger immediate log cleanup + database optimization."""
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
        trace_id=trace_id,
    )
    await db.commit()

    return {
        "ok": optimize_ok,
        "message": (
            "Storage optimization completed"
            if optimize_ok
            else "Storage cleanup completed, database optimize partially failed"
        ),
    }
