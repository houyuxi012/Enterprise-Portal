import json
import logging
import os
import time
import uuid
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import httpx
import psutil
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import core.database as database
import modules.models as models
import modules.schemas as schemas
from application.admin_app import (
    AuditService,
    LicenseService,
    PlatformRuntimeApplyError,
    SYSTEM_CONFIG_MASKED_PLACEHOLDER,
    apply_platform_runtime,
    build_notification_sample_context,
    build_sms_test_payload,
    cache,
    cleanup_logs,
    decrypt_sensitive_system_config_value,
    decrypt_system_config_map,
    encrypt_sensitive_system_config_value,
    get_localized_notification_template_name,
    get_notification_email_branding,
    get_system_config_map,
    is_masked_placeholder,
    is_sensitive_system_config_key,
    license_settings,
    optimize_database,
    render_notification_template,
    resolve_notification_template,
    sanitize_system_config_map_for_client,
    send_email_message,
    storage,
    test_ntp_connectivity,
    update_loki_retention,
)
from core.dependencies import PermissionChecker

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/system",
    tags=["system"],
)

# Alias router for /api/v1/system/license/* (admin audience only, wired in main.py)
license_alias_router = APIRouter(
    prefix="/system/license",
    tags=["system"],
)

VERSION_DEFAULTS = {
    "product": "Next-Gen Enterprise Portal",
    "product_id": "enterprise-portal",
    "version": "dev",
    "semver": "0.0.0",
    "channel": "dev",
    "git_sha": "unknown",
    "git_ref": "unknown",
    "dirty": False,
    "build_time": "unknown",
    "build_number": "0",
    "build_id": "unknown",
    "release_id": "unknown",
    "api_version": "v1",
    "db_schema_version": "1.0.0",
}

NUMERIC_SECURITY_CONFIG_RULES: dict[str, tuple[int, int]] = {
    "login_captcha_threshold": (1, 20),
    "security_login_max_retries": (1, 50),
    "security_lockout_duration": (1, 1440),
    "login_session_timeout_minutes": (5, 43200),
    "admin_session_timeout_minutes": (5, 43200),
    "login_session_absolute_timeout_minutes": (5, 43200),
    "login_session_refresh_window_minutes": (1, 120),
    "max_concurrent_sessions": (0, 100),
    "platform_snmp_port": (1, 65535),
    "platform_ntp_port": (1, 65535),
    "platform_ntp_sync_interval_minutes": (1, 10080),
    "backup_schedule_hour": (0, 23),
    "backup_schedule_weekday": (1, 7),
    "backup_retention_days": (1, 3650),
}


def _parse_positive_int(value: object) -> int | None:
    try:
        parsed = int(str(value or "").strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None

ENUM_SECURITY_CONFIG_RULES: dict[str, set[str]] = {
    "security_lockout_scope": {"account", "ip"},
    "platform_snmp_version": {"v2c", "v3"},
    "backup_enabled": {"true", "false"},
    "backup_schedule_frequency": {"daily", "weekly"},
    "backup_target_type": {"local", "network"},
}

LOGIN_RUNTIME_POLICY_KEYS = {
    "login_captcha_threshold",
    "security_login_max_retries",
    "security_lockout_duration",
    "security_lockout_scope",
    "login_session_timeout_minutes",
    "admin_session_timeout_minutes",
    "login_session_absolute_timeout_minutes",
    "login_session_refresh_window_minutes",
    "max_concurrent_sessions",
}

PLATFORM_RUNTIME_STATUS_KEYS = {
    "platform_last_applied_at",
    "platform_last_apply_status",
    "platform_last_apply_message",
    "platform_last_reload_required",
    "platform_last_hook_status",
    "platform_last_hook_output",
}

NTP_CONFIG_KEYS = {
    "platform_ntp_enabled",
    "platform_ntp_server",
    "platform_ntp_port",
    "platform_ntp_sync_interval_minutes",
    "platform_ntp_manual_time",
}

CUSTOMIZATION_CONFIG_KEYS = {
    "app_name",
    "browser_title",
    "logo_url",
    "favicon_url",
    "footer_text",
    "privacy_policy",
}

MFA_SETTINGS_CONFIG_KEYS = {
    "security_mfa_enabled",
}

SCOPED_FEATURE_REQUIREMENTS = {
    "customization": "customization.manage",
    "mfa": "mfa.settings",
}

CUSTOMIZATION_DEFAULT_CONFIG: Dict[str, str] = {
    "app_name": "Next-Gen Enterprise Portal",
    "browser_title": "Next-Gen Enterprise Portal",
    "logo_url": "/images/logo.png",
    "favicon_url": "/images/favicon.ico",
    "footer_text": "© 2025 侯钰熙 All Rights Reserved.",
    "privacy_policy": "",
}

BACKUP_SNAPSHOT_KIND = "system_config_snapshot"
BACKUP_EPHEMERAL_CONFIG_KEYS = PLATFORM_RUNTIME_STATUS_KEYS.union({"system_version", "system_build_id"})


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    candidate = str(value).strip().lower()
    if candidate == "":
        return default
    return candidate in {"1", "true", "yes", "on", "enabled"}


def _normalize_config_scope(scope: str | None) -> str:
    return (scope or "").strip().lower()


async def _require_feature_by_scope(db: AsyncSession, scope: str | None) -> None:
    required_feature = SCOPED_FEATURE_REQUIREMENTS.get(_normalize_config_scope(scope))
    if required_feature:
        await LicenseService.require_feature(db, required_feature)


async def _require_feature_by_config_keys(db: AsyncSession, keys: set[str]) -> None:
    if keys.intersection(CUSTOMIZATION_CONFIG_KEYS):
        await LicenseService.require_feature(db, "customization.manage")
    if keys.intersection(MFA_SETTINGS_CONFIG_KEYS):
        await LicenseService.require_feature(db, "mfa.settings")


async def _upsert_system_config_entries(db: AsyncSession, pairs: Dict[str, str]) -> None:
    for key, value in pairs.items():
        result = await db.execute(
            select(models.SystemConfig).filter(models.SystemConfig.key == key)
        )
        existing = result.scalars().first()
        stored_value = (
            encrypt_sensitive_system_config_value(key, value)
            if is_sensitive_system_config_key(key)
            else value
        )
        if existing:
            existing.value = stored_value
        else:
            db.add(models.SystemConfig(key=key, value=stored_value))


async def _load_system_config_map(db: AsyncSession, keys: list[str] | set[str] | None = None) -> Dict[str, str]:
    stmt = select(models.SystemConfig)
    if keys is not None:
        stmt = stmt.where(models.SystemConfig.key.in_(list(keys)))
    result = await db.execute(stmt)
    config_map = {cfg.key: cfg.value for cfg in result.scalars().all()}
    return decrypt_system_config_map(config_map)

# Simple state for network speed calculation
_last_net_io = None
_last_net_time = None


async def _upsert_raw_system_config_entries(db: AsyncSession, pairs: Dict[str, str | None]) -> None:
    for key, value in pairs.items():
        result = await db.execute(
            select(models.SystemConfig).filter(models.SystemConfig.key == key)
        )
        existing = result.scalars().first()
        if existing:
            existing.value = value
        else:
            db.add(models.SystemConfig(key=key, value=value))


def _require_backup_root(config_map: Dict[str, str], create: bool = False) -> Path:
    target_path = str(config_map.get("backup_target_path") or "").strip()
    if not target_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_PATH_REQUIRED", "message": "请先配置备份目标路径"},
        )

    backup_root = Path(target_path).expanduser()
    if create:
        backup_root.mkdir(parents=True, exist_ok=True)
    if not backup_root.exists() or not backup_root.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_PATH_INVALID", "message": "备份目标路径不可用"},
        )
    return backup_root


def _resolve_backup_file(backup_root: Path, backup_name: str) -> Path:
    normalized_name = Path(backup_name).name
    if not normalized_name or normalized_name != backup_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_NAME_INVALID", "message": "备份文件名不合法"},
        )

    backup_file = (backup_root / normalized_name).resolve()
    root_resolved = backup_root.resolve()
    if backup_file.parent != root_resolved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_NAME_INVALID", "message": "备份文件名不合法"},
        )
    return backup_file


def _build_backup_snapshot_name() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"portal-config-backup-{timestamp}-{uuid.uuid4().hex[:8]}.json"


def _read_backup_snapshot(backup_file: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(backup_file.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BACKUP_NOT_FOUND", "message": "备份文件不存在"},
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_FORMAT_INVALID", "message": "备份文件格式无效"},
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_FORMAT_INVALID", "message": "备份文件格式无效"},
        )
    return payload


def _build_backup_entry(backup_file: Path, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    stat = backup_file.stat()
    snapshot = payload or _read_backup_snapshot(backup_file)
    version_info = snapshot.get("version_info") if isinstance(snapshot.get("version_info"), dict) else {}
    target_type = str(snapshot.get("target_type") or "local")
    config_items = snapshot.get("system_config")
    restorable = snapshot.get("backup_kind") == BACKUP_SNAPSHOT_KIND and isinstance(config_items, dict)

    return {
        "name": backup_file.name,
        "size_bytes": stat.st_size,
        "created_at": str(
            snapshot.get("created_at")
            or datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        ),
        "version": str(version_info.get("version") or "-"),
        "schema_version": str(version_info.get("db_schema_version") or "-"),
        "target_type": target_type,
        "path": str(backup_file),
        "kind": str(snapshot.get("backup_kind") or "unknown"),
        "restorable": restorable,
    }


def _mask_backup_preview_value(key: str, value: Any) -> str:
    text = "" if value is None else str(value)
    if is_sensitive_system_config_key(key) and text:
        return SYSTEM_CONFIG_MASKED_PLACEHOLDER
    return text


def _build_backup_preview(
    backup_entry: Dict[str, Any],
    snapshot_items: Dict[str, Any],
    current_items: Dict[str, Any],
) -> Dict[str, Any]:
    create_count = 0
    update_count = 0
    unchanged_count = 0
    diffs: list[Dict[str, Any]] = []

    for key in sorted(snapshot_items.keys()):
        snapshot_value = snapshot_items.get(key)
        current_value = current_items.get(key)

        if key not in current_items:
            create_count += 1
            status_label = "create"
        elif current_value != snapshot_value:
            update_count += 1
            status_label = "update"
        else:
            unchanged_count += 1
            continue

        diffs.append(
            {
                "key": key,
                "status": status_label,
                "sensitive": is_sensitive_system_config_key(key),
                "current_value": _mask_backup_preview_value(key, current_value),
                "backup_value": _mask_backup_preview_value(key, snapshot_value),
            }
        )

    return {
        "backup": backup_entry,
        "summary": {
            "create_count": create_count,
            "update_count": update_count,
            "unchanged_count": unchanged_count,
            "total_keys": len(snapshot_items),
        },
        "diffs": diffs,
    }


def _list_backup_entries(backup_root: Path) -> list[Dict[str, Any]]:
    entries: list[Dict[str, Any]] = []
    for backup_file in sorted(
        backup_root.glob("portal-config-backup-*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    ):
        try:
            entries.append(_build_backup_entry(backup_file))
        except HTTPException:
            logger.warning("Skipping invalid backup snapshot file: %s", backup_file)
    return entries


def _read_first_line(file_paths: list[str]) -> str:
    for path in file_paths:
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    line = f.readline().strip()
                    if line:
                        return line
        except Exception:
            continue
    return ""


def _read_cpu_model() -> str:
    try:
        with open("/proc/cpuinfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    parts = line.split(":", 1)
                    if len(parts) > 1:
                        return parts[1].strip()
    except Exception:
        pass
    return platform.processor() or "unknown"


def _get_hardware_fingerprint_payload() -> dict:
    vm = psutil.virtual_memory()
    root_disk = psutil.disk_usage("/")

    root_partition = None
    try:
        for part in psutil.disk_partitions(all=False):
            if part.mountpoint == "/":
                root_partition = part
                break
    except Exception:
        root_partition = None

    payload = {
        "system": {
            "os": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
        },
        "cpu": {
            "logical_count": psutil.cpu_count(logical=True),
            "physical_count": psutil.cpu_count(logical=False),
            "model": _read_cpu_model(),
        },
        "memory": {
            "total_bytes": vm.total,
        },
        "disk": {
            "total_bytes": root_disk.total,
            "device": getattr(root_partition, "device", "unknown"),
            "fstype": getattr(root_partition, "fstype", "unknown"),
        },
        "host": {
            "hostname": platform.node(),
            "machine_id": _read_first_line(["/etc/machine-id", "/var/lib/dbus/machine-id"]),
            "mac": f"{uuid.getnode():012x}",
        },
    }
    return payload


@router.get("/privacy/consents", response_model=Dict[str, Any])
async def list_privacy_consents(
    request: Request,
    background_tasks: BackgroundTasks,
    username: str | None = Query(default=None),
    audience: str | None = Query(default=None, pattern="^(admin|portal)$"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    base_query = select(models.PrivacyConsent)
    count_query = select(func.count(models.PrivacyConsent.id))

    if username:
        candidate = f"%{username.strip()}%"
        base_query = base_query.where(models.PrivacyConsent.username.ilike(candidate))
        count_query = count_query.where(models.PrivacyConsent.username.ilike(candidate))
    if audience:
        base_query = base_query.where(models.PrivacyConsent.audience == audience)
        count_query = count_query.where(models.PrivacyConsent.audience == audience)

    total_result = await db.execute(count_query)
    total = int(total_result.scalar() or 0)

    rows_result = await db.execute(
        base_query.order_by(desc(models.PrivacyConsent.accepted_at)).limit(limit).offset(offset)
    )
    rows = rows_result.scalars().all()
    items = [
        {
            "id": row.id,
            "user_id": row.user_id,
            "username": row.username,
            "audience": row.audience,
            "policy_version": row.policy_version,
            "policy_hash": row.policy_hash,
            "accepted": bool(row.accepted),
            "ip_address": row.ip_address,
            "locale": row.locale,
            "trace_id": row.trace_id,
            "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
        }
        for row in rows
    ]

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="READ_PRIVACY_CONSENTS",
        target="隐私同意记录",
        detail=f"username={username or '*'}, audience={audience or '*'}, limit={limit}, offset={offset}, total={total}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="SYSTEM",
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
    }


def _build_system_serial_number() -> str:
    # Keep serial aligned with license installation identifier.
    return license_settings.INSTALLATION_ID


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


async def check_version_upgrade(session_factory):
    """
    Check if the system version has changed since the last run.
    If changed, log a system audit event.
    """
    version_info = _load_version_info()
    current_version = version_info.get("version", "unknown")
    current_build = version_info.get("build_id", "unknown")
    product_name = version_info.get("product", "System")

    try:
        async with session_factory() as db:
            # Check stored version
            result = await db.execute(
                select(models.SystemConfig).filter(models.SystemConfig.key == "system_version")
            )
            version_config = result.scalars().first()
            stored_version = version_config.value if version_config else "new_install"

            # Check stored build
            result = await db.execute(
                select(models.SystemConfig).filter(models.SystemConfig.key == "system_build_id")
            )
            build_config = result.scalars().first()
            stored_build = build_config.value if build_config else "unknown"

            # Compare (Ignore if both are unknown/dev defaults potentially, but good to track)
            if stored_version != current_version or stored_build != current_build:
                logger.info(
                    "System Upgrade Detected: %s (%s) -> %s (%s)",
                    stored_version,
                    stored_build,
                    current_version,
                    current_build,
                )

                # 1. Update Config (Version)
                if version_config:
                    version_config.value = current_version
                else:
                    db.add(models.SystemConfig(key="system_version", value=current_version))

                # 2. Update Config (Build ID)
                if build_config:
                    build_config.value = current_build
                else:
                    db.add(models.SystemConfig(key="system_build_id", value=current_build))

                # 3. Audit Log
                # We try to attribute this to system (ID 1 usually Admin, or 0 if supported)
                # If ID 1 doesn't exist, this might fail, so we wrap in try/except or assume seeded DB
                try:
                    AuditService.schedule_business_action(
                        user_id=1,  # Assume Admin ID 1 exists
                        username="system_auto",
                        action="SYSTEM_UPGRADE",
                        target=product_name,
                        detail=f"Upgrade: {stored_version} -> {current_version} (Build {stored_build} -> {current_build})",
                        ip_address="127.0.0.1",
                        trace_id=f"upgrade-{int(time.time())}",
                        domain="SYSTEM",
                    )
                except Exception as audit_err:
                    logger.warning("Failed to write upgrade audit log: %s", audit_err)

                await db.commit()
            else:
                logger.debug("System version matches stored version (%s). No action.", current_version)

    except Exception as e:
        logger.error("Failed to perform startup version check: %s", e)


@router.get("/config", response_model=Dict[str, str])
async def get_system_config(
    request: Request,
    background_tasks: BackgroundTasks,
    scope: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    normalized_scope = _normalize_config_scope(scope)
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    fallback_to_default_customization = False
    try:
        await _require_feature_by_scope(db, normalized_scope)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        code = str(detail.get("code") or "").upper()
        if normalized_scope == "customization" and code == LicenseService.CODE_LICENSE_REQUIRED:
            fallback_to_default_customization = True
        else:
            raise

    if fallback_to_default_customization:
        config_map = dict(CUSTOMIZATION_DEFAULT_CONFIG)
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="READ_SYSTEM_CONFIG",
            target="客户化管理",
            detail="scope=customization, source=default_config, reason=feature_not_licensed",
            ip_address=ip,
            trace_id=trace_id,
            domain="SYSTEM",
        )
        return config_map

    config_map = await _load_system_config_map(db)
    if normalized_scope == "platform":
        platform_keys = sorted([key for key in config_map.keys() if key.startswith("platform_")])
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="READ_PLATFORM_SETTINGS",
            target="平台设置",
            detail=f"keys={platform_keys}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
    elif normalized_scope == "mfa":
        mfa_keys = sorted([key for key in config_map.keys() if key in MFA_SETTINGS_CONFIG_KEYS])
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="READ_MFA_SETTINGS",
            target="多因素认证设置",
            detail=f"keys={mfa_keys}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
    else:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="READ_SYSTEM_CONFIG",
            target="系统配置",
            detail=f"keys={sorted(config_map.keys())}",
            ip_address=ip,
            trace_id=trace_id,
            domain="SYSTEM",
        )
    return sanitize_system_config_map_for_client(config_map)


@router.post("/config", response_model=Dict[str, str])
async def update_system_config(
    request: Request,
    background_tasks: BackgroundTasks,
    config: Dict[str, str],
    scope: str | None = Query(default=None),
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    result = await db.execute(select(models.SystemConfig))
    existing_configs = result.scalars().all()
    existing_config_map = decrypt_system_config_map({c.key: c.value for c in existing_configs})
    existing_config_items = {c.key: c for c in existing_configs}

    normalized_config: Dict[str, str] = {}
    for key, value in config.items():
        normalized_value = value
        if key in NUMERIC_SECURITY_CONFIG_RULES:
            min_value, max_value = NUMERIC_SECURITY_CONFIG_RULES[key]
            candidate = str(value).strip() if value is not None else ""
            if candidate == "":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"配置项 {key} 不能为空",
                )
            try:
                numeric_value = int(candidate)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"配置项 {key} 必须是整数",
                )
            if numeric_value < min_value or numeric_value > max_value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"配置项 {key} 取值范围为 [{min_value}, {max_value}]",
                )
            normalized_value = str(numeric_value)
        elif key in ENUM_SECURITY_CONFIG_RULES:
            allowed_values = ENUM_SECURITY_CONFIG_RULES[key]
            candidate = str(value).strip().lower() if value is not None else ""
            if candidate not in allowed_values:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"配置项 {key} 仅支持: {', '.join(sorted(allowed_values))}",
                )
            normalized_value = candidate
        normalized_config[key] = str(normalized_value)

    await _require_feature_by_scope(db, scope)
    await _require_feature_by_config_keys(db, set(normalized_config.keys()))

    if NTP_CONFIG_KEYS.intersection(normalized_config.keys()):
        candidate_config = {**existing_config_map, **normalized_config}
        if _as_bool(candidate_config.get("platform_ntp_enabled"), default=False):
            ntp_server = str(candidate_config.get("platform_ntp_server") or "").strip()
            ntp_port_raw = candidate_config.get("platform_ntp_port", "123")
            try:
                ntp_port = int(str(ntp_port_raw))
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "NTP_PORT_INVALID", "message": "NTP 端口必须是整数"},
                )
            trace_id = request.headers.get("X-Request-ID")
            ip = request.client.host if request.client else "unknown"
            try:
                ntp_result = test_ntp_connectivity(ntp_server, ntp_port)
                AuditService.schedule_business_action(
                    background_tasks=background_tasks,
                    user_id=current_user.id,
                    username=current_user.username,
                    action="TEST_PLATFORM_NTP_CONNECTIVITY",
                    target="平台设置",
                    detail=(
                        f"server={ntp_result.get('server')}, "
                        f"port={ntp_result.get('port')}, "
                        f"latency_ms={ntp_result.get('latency_ms')}, "
                        f"status=success"
                    ),
                    ip_address=ip,
                    trace_id=trace_id,
                    domain="BUSINESS",
                )
            except PlatformRuntimeApplyError as exc:
                AuditService.schedule_business_action(
                    background_tasks=background_tasks,
                    user_id=current_user.id,
                    username=current_user.username,
                    action="TEST_PLATFORM_NTP_CONNECTIVITY",
                    target="平台设置",
                    detail=f"server={ntp_server}, port={ntp_port}, status=failed, code={exc.code}",
                    ip_address=ip,
                    trace_id=trace_id,
                    domain="BUSINESS",
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": exc.code, "message": exc.message},
                )

    for key, value in normalized_config.items():
        if is_sensitive_system_config_key(key) and is_masked_placeholder(value):
            continue

        stored_value = (
            encrypt_sensitive_system_config_value(key, value)
            if is_sensitive_system_config_key(key)
            else value
        )
        existing = existing_config_items.get(key)
        if existing:
            existing.value = stored_value
        else:
            db.add(models.SystemConfig(key=key, value=stored_value))

    # Sync Loki retention if access log retention is updated
    if "log_retention_access_days" in normalized_config:
        try:
            retention_days = int(normalized_config["log_retention_access_days"])
            if update_loki_retention(retention_days):
                logger.info("Loki retention synced to %s days", retention_days)
            else:
                logger.warning("Loki retention sync failed - config may not be mounted")
        except (ValueError, TypeError) as e:
            logger.error("Invalid access log retention value: %s", e)

    # Runtime login policies changed: clear transient login fail caches so
    # the new threshold/config takes effect immediately.
    if LOGIN_RUNTIME_POLICY_KEYS.intersection(normalized_config.keys()):
        try:
            await cache.delete_pattern("iam:login:fail:principal:*")
            await cache.delete_pattern("iam:login:fail:ip:*")
            await cache.delete_pattern("iam:login:lock:ip:*")
        except Exception as e:
            logger.warning("Failed to clear login fail caches after policy update: %s", e)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    updated_keys = sorted(normalized_config.keys())
    updated_platform_keys = [key for key in updated_keys if key.startswith("platform_")]
    updated_mfa_keys = [key for key in updated_keys if key in MFA_SETTINGS_CONFIG_KEYS]
    updated_non_platform_keys = [
        key for key in updated_keys if not key.startswith("platform_") and key not in MFA_SETTINGS_CONFIG_KEYS
    ]

    if updated_platform_keys:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="UPDATE_PLATFORM_SETTINGS",
            target="平台设置",
            detail=f"Updated keys: {', '.join(updated_platform_keys)}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
    if updated_mfa_keys:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="UPDATE_MFA_SETTINGS",
            target="多因素认证设置",
            detail=f"Updated keys: {', '.join(updated_mfa_keys)}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
    if updated_non_platform_keys:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="UPDATE_SYSTEM_CONFIG",
            target="系统配置",
            detail=f"Updated keys: {', '.join(updated_non_platform_keys)}",
            ip_address=ip,
            trace_id=trace_id,
            domain="SYSTEM",
        )

    await db.commit()

    final_map = await _load_system_config_map(db)
    return sanitize_system_config_map_for_client(final_map)


@router.get("/platform/runtime", response_model=Dict[str, str])
async def get_platform_runtime_status(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    result = await db.execute(
        select(models.SystemConfig).where(models.SystemConfig.key.in_(PLATFORM_RUNTIME_STATUS_KEYS))
    )
    configs = result.scalars().all()
    config_map = {c.key: c.value for c in configs}
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="READ_PLATFORM_RUNTIME_STATUS",
        target="平台设置",
        detail=f"keys={sorted(config_map.keys())}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return config_map


@router.post("/platform/ntp/test", response_model=Dict[str, str | int])
async def test_platform_ntp_connectivity(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: Dict[str, str | int],
    _: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    ntp_server = str(payload.get("platform_ntp_server") or "").strip()
    ntp_port_raw = payload.get("platform_ntp_port", 123)
    try:
        ntp_port = int(str(ntp_port_raw))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NTP_PORT_INVALID", "message": "NTP 端口必须是整数"},
        )

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    try:
        result = test_ntp_connectivity(ntp_server, ntp_port)
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_PLATFORM_NTP_CONNECTIVITY",
            target="平台设置",
            detail=(
                f"server={result.get('server')}, "
                f"port={result.get('port')}, "
                f"latency_ms={result.get('latency_ms')}, "
                f"status=success"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        return {
            "status": "success",
            "message": "NTP 连通性测试成功",
            "server": str(result.get("server") or ntp_server),
            "port": int(result.get("port") or ntp_port),
            "latency_ms": int(result.get("latency_ms") or 0),
            "stratum": int(result.get("stratum") or 0),
        }
    except PlatformRuntimeApplyError as exc:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_PLATFORM_NTP_CONNECTIVITY",
            target="平台设置",
            detail=f"server={ntp_server}, port={ntp_port}, status=failed, code={exc.code}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        )


@router.post("/platform/apply", response_model=Dict[str, str | bool])
async def apply_platform_config(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    config_map = await _load_system_config_map(db)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"

    try:
        apply_result = apply_platform_runtime(config_map)
        runtime_status = {
            "platform_last_applied_at": str(apply_result.get("applied_at") or ""),
            "platform_last_apply_status": "success",
            "platform_last_apply_message": str(apply_result.get("message") or "平台配置应用成功"),
            "platform_last_reload_required": "true" if bool(apply_result.get("reload_required")) else "false",
            "platform_last_hook_status": str(apply_result.get("hook_status") or "not_configured"),
            "platform_last_hook_output": str(apply_result.get("hook_output") or ""),
        }
        await _upsert_system_config_entries(db, runtime_status)
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="APPLY_PLATFORM_SETTINGS",
            target="平台设置",
            detail=(
                f"server_name={apply_result.get('server_name')}, "
                f"ssl_enabled={apply_result.get('ssl_enabled')}, "
                f"reload_required={apply_result.get('reload_required')}, "
                f"hook_status={apply_result.get('hook_status')}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        await db.commit()
        return {
            "status": "success",
            "message": str(apply_result.get("message") or "平台配置已应用"),
            "applied_at": str(apply_result.get("applied_at") or ""),
            "hook_status": str(apply_result.get("hook_status") or "not_configured"),
            "reload_required": bool(apply_result.get("reload_required")),
        }
    except PlatformRuntimeApplyError as exc:
        await _upsert_system_config_entries(
            db,
            {
                "platform_last_apply_status": "failed",
                "platform_last_apply_message": exc.message,
                "platform_last_hook_status": "failed",
            },
        )
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="APPLY_PLATFORM_SETTINGS_FAILED",
            target="平台设置",
            detail=f"code={exc.code}, message={exc.message}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        )
    except Exception as exc:
        logger.error("Unexpected platform apply error: %s", exc)
        await _upsert_system_config_entries(
            db,
            {
                "platform_last_apply_status": "failed",
                "platform_last_apply_message": "平台配置应用失败",
                "platform_last_hook_status": "error",
            },
        )
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="APPLY_PLATFORM_SETTINGS_FAILED",
            target="平台设置",
            detail=f"unexpected_error={type(exc).__name__}",
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PLATFORM_APPLY_FAILED", "message": "平台配置应用失败"},
        )


@router.post("/smtp/test")
async def test_smtp(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    """Send a test email using current SMTP configuration."""
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    template_id = _parse_positive_int(body.get("template_id"))
    to_email = str(body.get("to_email") or "").strip()
    if not to_email:
        config_map = await get_system_config_map(db, ["smtp_sender", "notification_email_template_id"])
        to_email = str(config_map.get("smtp_sender") or "").strip()
    else:
        config_map = await get_system_config_map(db, ["notification_email_template_id"])
    if not to_email:
        raise HTTPException(status_code=400, detail="请指定测试收件地址")

    selected_template = await resolve_notification_template(
        db,
        channel="email",
        template_id=template_id,
        config_map=config_map,
    )
    if selected_template is not None:
        email_branding = await get_notification_email_branding(db)
        rendered = render_notification_template(
            selected_template,
            build_notification_sample_context(
                current_user=current_user,
                channel="email",
                recipient=to_email,
                public_base_url=str((email_branding or {}).get("public_base_url") or ""),
            ),
            email_branding=email_branding,
        )
        subject = str(rendered["subject"] or "SMTP Service Test").strip() or "SMTP Service Test"
        text_body = str(rendered["content"] or "").strip()
        html_body = str(rendered.get("html_content") or "").strip() or None
    else:
        subject = "SMTP Service Test - Next-Gen Enterprise Portal"
        text_body = (
            "This is a test email sent from the notification service settings page.\n"
            f"Recipient: {to_email}\n"
            f"Operator: {current_user.username}\n"
        )
        html_body = None

    try:
        await send_email_message(to_email, subject, db, text_body=text_body, html_body=html_body)
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_SMTP_SERVICE",
            target="通知服务",
            detail=(
                f"to={to_email}, status=success, "
                f"template={selected_template.code if selected_template is not None else 'none'}"
            ),
            ip_address=request.client.host if request.client else "unknown",
            trace_id=request.headers.get("X-Request-ID"),
            domain="BUSINESS",
        )
    except ValueError as e:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_SMTP_SERVICE",
            target="通知服务",
            detail=(
                f"to={to_email}, status=failed, "
                f"template={selected_template.code if selected_template is not None else 'none'}, "
                f"reason={str(e)}"
            ),
            ip_address=request.client.host if request.client else "unknown",
            trace_id=request.headers.get("X-Request-ID"),
            domain="BUSINESS",
        )
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "message": f"测试邮件已发送到 {to_email}",
        "template": (
            get_localized_notification_template_name(selected_template, locale=getattr(current_user, "locale", None))
            if selected_template is not None
            else None
        ),
    }


@router.post("/telegram/test")
async def test_telegram_bot(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    """Send a Telegram bot test message with current or provided config."""
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    template_id = _parse_positive_int(body.get("template_id"))
    bot_token = str(body.get("bot_token") or "").strip()
    chat_id = str(body.get("chat_id") or "").strip()
    parse_mode = str(body.get("parse_mode") or "").strip()
    disable_web_page_preview = body.get("disable_web_page_preview", True)
    test_message = str(body.get("message") or "").strip()
    if not test_message:
        test_message = "【Next-Gen Enterprise Portal】Telegram Bot 测试消息"

    if not bot_token or not chat_id:
        config_map = await get_system_config_map(
            db,
            [
                "telegram_bot_token",
                "telegram_chat_id",
                "telegram_parse_mode",
                "telegram_disable_web_page_preview",
                "notification_im_template_id",
            ],
        )
        bot_token = bot_token or str(config_map.get("telegram_bot_token") or "").strip()
        chat_id = chat_id or str(config_map.get("telegram_chat_id") or "").strip()
        parse_mode = parse_mode or str(config_map.get("telegram_parse_mode") or "").strip()
        if "telegram_disable_web_page_preview" in config_map:
            disable_web_page_preview = str(config_map.get("telegram_disable_web_page_preview")).strip().lower() == "true"
    else:
        config_map = await get_system_config_map(db, ["notification_im_template_id"])

    if not bot_token or not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "TELEGRAM_CONFIG_REQUIRED", "message": "请先配置 Telegram Bot Token 和 Chat ID"},
        )

    selected_template = await resolve_notification_template(
        db,
        channel="im",
        template_id=template_id,
        config_map=config_map,
    )
    if selected_template is not None:
        rendered = render_notification_template(
            selected_template,
            build_notification_sample_context(
                current_user=current_user,
                channel="im",
                recipient=chat_id,
            ),
        )
        test_message = str(rendered["content"] or "").strip() or test_message

    safe_parse_mode = parse_mode if parse_mode in {"MarkdownV2", "HTML", "Markdown"} else ""
    telegram_payload: dict[str, object] = {
        "chat_id": chat_id,
        "text": test_message,
        "disable_web_page_preview": bool(disable_web_page_preview),
    }
    if safe_parse_mode:
        telegram_payload["parse_mode"] = safe_parse_mode

    telegram_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    masked_chat = f"***{chat_id[-4:]}" if len(chat_id) > 4 else "***"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(telegram_url, json=telegram_payload)

        error_message = ""
        if not response.is_success:
            try:
                data = response.json()
                error_message = str(data.get("description") or "")
            except Exception:
                error_message = response.text[:200]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "TELEGRAM_TEST_FAILED",
                    "message": f"Telegram 发送失败: {error_message or f'HTTP {response.status_code}'}",
                },
            )

        try:
            data = response.json()
        except Exception:
            data = {}
        if not bool(data.get("ok", False)):
            error_message = str(data.get("description") or "unknown error")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "TELEGRAM_TEST_FAILED", "message": f"Telegram 发送失败: {error_message}"},
            )

        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_TELEGRAM_BOT",
            target="通知服务",
            detail=(
                f"chat_id={masked_chat}, status=success, "
                f"template={selected_template.code if selected_template is not None else 'none'}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        return {
            "message": "Telegram 测试消息发送成功",
            "template": (
                get_localized_notification_template_name(selected_template, locale=getattr(current_user, "locale", None))
                if selected_template is not None
                else None
            ),
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_TELEGRAM_BOT",
            target="通知服务",
            detail=(
                f"chat_id={masked_chat}, status=failed, "
                f"template={selected_template.code if selected_template is not None else 'none'}, "
                f"code={detail.get('code', 'UNKNOWN')}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        raise
    except Exception as exc:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_TELEGRAM_BOT",
            target="通知服务",
            detail=(
                f"chat_id={masked_chat}, status=failed, "
                f"template={selected_template.code if selected_template is not None else 'none'}, "
                f"code=UNEXPECTED_ERROR, error={type(exc).__name__}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "TELEGRAM_TEST_FAILED", "message": "Telegram 测试消息发送失败"},
        )


def _mask_phone(phone: str) -> str:
    value = str(phone or "").strip()
    if len(value) <= 4:
        return "***"
    return f"{value[:3]}****{value[-2:]}"


def _is_nonempty(value: object) -> bool:
    return bool(str(value or "").strip())


def _is_sms_provider_configured(config_map: dict[str, str], provider: str) -> bool:
    normalized = str(provider or "").strip().lower()
    if normalized == "aliyun":
        required = ("sms_access_key_id", "sms_access_key_secret", "sms_sign_name", "sms_template_code")
        return all(_is_nonempty(config_map.get(key)) for key in required)
    if normalized == "tencent":
        required = ("tencent_secret_id", "tencent_secret_key", "tencent_sdk_app_id", "tencent_sign_name", "tencent_template_id")
        return all(_is_nonempty(config_map.get(key)) for key in required)
    if normalized == "twilio":
        has_sid = _is_nonempty(config_map.get("twilio_account_sid"))
        has_token = _is_nonempty(config_map.get("twilio_auth_token"))
        has_from = _is_nonempty(config_map.get("twilio_from_number"))
        has_service_sid = _is_nonempty(config_map.get("twilio_messaging_service_sid"))
        return has_sid and has_token and (has_from or has_service_sid)
    return False


def _send_sms_via_aliyun(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from alibabacloud_dysmsapi20170525.client import Client as DysmsClient
        from alibabacloud_dysmsapi20170525 import models as dysms_models
        from alibabacloud_tea_openapi import models as open_api_models
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "SMS_SDK_NOT_INSTALLED",
                "message": "阿里云短信 SDK 未安装，请安装 alibabacloud_dysmsapi20170525 与 alibabacloud_tea_openapi",
            },
        ) from exc

    access_key_id = str(payload.get("sms_access_key_id") or "").strip()
    access_key_secret = str(payload.get("sms_access_key_secret") or "").strip()
    sign_name = str(payload.get("sms_sign_name") or "").strip()
    template_code = str(payload.get("sms_template_code") or "").strip()
    phone = str(payload.get("test_phone") or "").strip()
    region_id = str(payload.get("sms_region_id") or "cn-hangzhou").strip() or "cn-hangzhou"
    template_param_raw = str(payload.get("sms_template_param") or "").strip()

    if not access_key_id or not access_key_secret or not sign_name or not template_code or not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_CONFIG_REQUIRED", "message": "阿里云短信测试缺少必要参数"},
        )

    template_param = template_param_raw or json.dumps({"code": "123456"}, ensure_ascii=False)
    client = DysmsClient(
        open_api_models.Config(
            access_key_id=access_key_id,
            access_key_secret=access_key_secret,
            endpoint=f"dysmsapi.{region_id}.aliyuncs.com",
            region_id=region_id,
        )
    )
    req = dysms_models.SendSmsRequest(
        phone_numbers=phone,
        sign_name=sign_name,
        template_code=template_code,
        template_param=template_param,
    )
    resp = client.send_sms(req)
    body = getattr(resp, "body", None)
    code = str(getattr(body, "code", "") or "")
    if code.upper() != "OK":
        msg = str(getattr(body, "message", "") or "Unknown error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_TEST_FAILED", "message": f"阿里云短信发送失败: {msg}"},
        )
    return {"provider": "aliyun", "request_id": str(getattr(body, "request_id", "") or "")}


def _send_sms_via_tencent(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from tencentcloud.common import credential
        from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
        from tencentcloud.sms.v20210111 import models as sms_models
        from tencentcloud.sms.v20210111.sms_client import SmsClient
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "SMS_SDK_NOT_INSTALLED",
                "message": "腾讯云短信 SDK 未安装，请安装 tencentcloud-sdk-python",
            },
        ) from exc

    secret_id = str(payload.get("tencent_secret_id") or "").strip()
    secret_key = str(payload.get("tencent_secret_key") or "").strip()
    app_id = str(payload.get("tencent_sdk_app_id") or "").strip()
    sign_name = str(payload.get("tencent_sign_name") or "").strip()
    template_id = str(payload.get("tencent_template_id") or "").strip()
    phone = str(payload.get("test_phone") or "").strip()
    region = str(payload.get("tencent_region") or "ap-guangzhou").strip() or "ap-guangzhou"
    params_raw = str(payload.get("tencent_template_params") or "").strip()

    if not secret_id or not secret_key or not app_id or not sign_name or not template_id or not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_CONFIG_REQUIRED", "message": "腾讯云短信测试缺少必要参数"},
        )

    template_params = [param for param in params_raw.split(",") if param.strip()] if params_raw else ["123456"]
    try:
        cred = credential.Credential(secret_id, secret_key)
        client = SmsClient(cred, region)
        req = sms_models.SendSmsRequest()
        req.SmsSdkAppId = app_id
        req.SignName = sign_name
        req.TemplateId = template_id
        req.TemplateParamSet = template_params
        req.PhoneNumberSet = [phone]
        resp = client.SendSms(req)
    except TencentCloudSDKException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_TEST_FAILED", "message": f"腾讯云短信发送失败: {str(exc)}"},
        ) from exc

    status_set = getattr(resp, "SendStatusSet", []) or []
    status_item = status_set[0] if status_set else None
    item_code = str(getattr(status_item, "Code", "") or "")
    if item_code != "Ok":
        item_msg = str(getattr(status_item, "Message", "") or "Unknown error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_TEST_FAILED", "message": f"腾讯云短信发送失败: {item_msg}"},
        )
    serial_no = str(getattr(status_item, "SerialNo", "") or "")
    return {"provider": "tencent", "serial_no": serial_no}


def _send_sms_via_twilio(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from twilio.rest import Client as TwilioClient
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "SMS_SDK_NOT_INSTALLED", "message": "Twilio SDK 未安装，请安装 twilio"},
        ) from exc

    account_sid = str(payload.get("twilio_account_sid") or "").strip()
    auth_token = str(payload.get("twilio_auth_token") or "").strip()
    from_number = str(payload.get("twilio_from_number") or "").strip()
    messaging_service_sid = str(payload.get("twilio_messaging_service_sid") or "").strip()
    phone = str(payload.get("test_phone") or "").strip()
    message = str(payload.get("test_message") or "").strip() or "[Next-Gen Enterprise Portal] SMS gateway test message"

    if not account_sid or not auth_token or not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_CONFIG_REQUIRED", "message": "Twilio 短信测试缺少必要参数"},
        )
    if not from_number and not messaging_service_sid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SMS_CONFIG_REQUIRED",
                "message": "Twilio 需提供 From Number 或 Messaging Service SID",
            },
        )

    client = TwilioClient(account_sid, auth_token)
    kwargs: dict[str, Any] = {"to": phone, "body": message}
    if messaging_service_sid:
        kwargs["messaging_service_sid"] = messaging_service_sid
    else:
        kwargs["from_"] = from_number
    try:
        resp = client.messages.create(**kwargs)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_TEST_FAILED", "message": f"Twilio 发送失败: {str(exc)}"},
        ) from exc
    return {"provider": "twilio", "sid": str(getattr(resp, "sid", "") or "")}


@router.post("/sms/test")
async def test_sms_gateway(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    """Test SMS sending using configured provider: aliyun / tencent / twilio."""
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    template_id = _parse_positive_int(body.get("template_id"))

    config_map = await get_system_config_map(
        db,
        [
            "sms_provider",
            "sms_test_phone",
            "sms_access_key_id",
            "sms_access_key_secret",
            "sms_sign_name",
            "sms_template_code",
            "sms_template_param",
            "sms_region_id",
            "tencent_secret_id",
            "tencent_secret_key",
            "tencent_sdk_app_id",
            "tencent_sign_name",
            "tencent_template_id",
            "tencent_template_params",
            "tencent_region",
            "twilio_account_sid",
            "twilio_auth_token",
            "twilio_from_number",
            "twilio_messaging_service_sid",
            "notification_sms_template_id",
        ],
    )
    payload: dict[str, Any] = {**config_map, **(body or {})}

    provider = str(payload.get("provider") or payload.get("sms_provider") or "").strip().lower()
    if not provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_CONFIG_REQUIRED", "message": "请先选择短信服务商"},
        )

    test_phone = str(payload.get("test_phone") or payload.get("sms_test_phone") or "").strip()
    if not test_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMS_CONFIG_REQUIRED", "message": "请填写测试手机号"},
        )
    payload["test_phone"] = test_phone

    selected_template = await resolve_notification_template(
        db,
        channel="sms",
        template_id=template_id,
        config_map=config_map,
    )
    if selected_template is not None:
        rendered_sms_payload = build_sms_test_payload(
            selected_template,
            build_notification_sample_context(
                current_user=current_user,
                channel="sms",
                recipient=test_phone,
            ),
        )
        if provider == "aliyun":
            payload["sms_template_param"] = rendered_sms_payload["aliyun_template_param"]
        elif provider == "tencent":
            payload["tencent_template_params"] = rendered_sms_payload["tencent_template_params"]
        elif provider == "twilio":
            payload["test_message"] = rendered_sms_payload["twilio_message"]

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    masked_phone = _mask_phone(test_phone)
    try:
        if provider == "aliyun":
            send_result = _send_sms_via_aliyun(payload)
        elif provider == "tencent":
            send_result = _send_sms_via_tencent(payload)
        elif provider == "twilio":
            send_result = _send_sms_via_twilio(payload)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SMS_PROVIDER_UNSUPPORTED", "message": f"不支持的短信服务商: {provider}"},
            )

        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_SMS_SERVICE",
            target="通知服务",
            detail=(
                f"provider={provider}, phone={masked_phone}, status=success, "
                f"template={selected_template.code if selected_template is not None else 'none'}, meta={send_result}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        return {
            "message": f"{provider} 短信测试发送成功",
            "template": (
                get_localized_notification_template_name(selected_template, locale=getattr(current_user, "locale", None))
                if selected_template is not None
                else None
            ),
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_SMS_SERVICE",
            target="通知服务",
            detail=(
                f"provider={provider}, phone={masked_phone}, status=failed, "
                f"template={selected_template.code if selected_template is not None else 'none'}, "
                f"code={detail.get('code', 'UNKNOWN')}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        raise
    except Exception as exc:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="TEST_SMS_SERVICE",
            target="通知服务",
            detail=(
                f"provider={provider}, phone={masked_phone}, status=failed, "
                f"template={selected_template.code if selected_template is not None else 'none'}, "
                f"code=UNEXPECTED_ERROR, error={type(exc).__name__}"
            ),
            ip_address=ip,
            trace_id=trace_id,
            domain="BUSINESS",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "SMS_TEST_FAILED", "message": "短信测试发送失败"},
        )


@router.get("/notification/health", response_model=Dict[str, Any])
async def get_notification_health(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    keys = [
        "smtp_host",
        "smtp_username",
        "smtp_password",
        "smtp_sender",
        "telegram_bot_enabled",
        "telegram_bot_token",
        "telegram_chat_id",
        "sms_enabled",
        "sms_provider",
        "sms_access_key_id",
        "sms_access_key_secret",
        "sms_sign_name",
        "sms_template_code",
        "tencent_secret_id",
        "tencent_secret_key",
        "tencent_sdk_app_id",
        "tencent_sign_name",
        "tencent_template_id",
        "twilio_account_sid",
        "twilio_auth_token",
        "twilio_from_number",
        "twilio_messaging_service_sid",
    ]
    result = await db.execute(select(models.SystemConfig).where(models.SystemConfig.key.in_(keys)))
    config_map = decrypt_system_config_map({cfg.key: cfg.value for cfg in result.scalars().all()})

    smtp_configured = all(_is_nonempty(config_map.get(key)) for key in ("smtp_host", "smtp_username", "smtp_password"))
    smtp_sender = str(config_map.get("smtp_sender") or "").strip() or str(config_map.get("smtp_username") or "").strip()
    smtp_status = "healthy" if smtp_configured else "not_configured"

    telegram_enabled = _as_bool(config_map.get("telegram_bot_enabled"), default=False)
    telegram_configured = all(_is_nonempty(config_map.get(key)) for key in ("telegram_bot_token", "telegram_chat_id"))
    if telegram_enabled and telegram_configured:
        telegram_status = "healthy"
    elif telegram_enabled and not telegram_configured:
        telegram_status = "misconfigured"
    else:
        telegram_status = "disabled"

    sms_enabled = _as_bool(config_map.get("sms_enabled"), default=False)
    sms_provider = str(config_map.get("sms_provider") or "").strip().lower()
    sms_configured = _is_sms_provider_configured(config_map, sms_provider)
    if sms_enabled and sms_configured:
        sms_status = "healthy"
    elif sms_enabled and not sms_configured:
        sms_status = "misconfigured"
    else:
        sms_status = "disabled"

    has_misconfigured = telegram_status == "misconfigured" or sms_status == "misconfigured"
    has_healthy = smtp_status == "healthy" or telegram_status == "healthy" or sms_status == "healthy"
    if has_misconfigured:
        overall_status = "degraded"
    elif has_healthy:
        overall_status = "healthy"
    else:
        overall_status = "disabled"

    payload = {
        "overall_status": overall_status,
        "channels": {
            "smtp": {
                "enabled": smtp_configured,
                "configured": smtp_configured,
                "status": smtp_status,
                "sender": smtp_sender,
            },
            "telegram": {
                "enabled": telegram_enabled,
                "configured": telegram_configured,
                "status": telegram_status,
            },
            "sms": {
                "enabled": sms_enabled,
                "configured": sms_configured,
                "status": sms_status,
                "provider": sms_provider or "",
            },
        },
    }

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="READ_NOTIFICATION_HEALTH",
        target="通知服务",
        detail=f"overall_status={overall_status}, channels={payload['channels']}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return payload


async def _install_license(
    *,
    request: Request,
    payload: schemas.LicenseInstallRequest,
    db: AsyncSession,
    current_user: models.User,
) -> dict:
    await LicenseService.install_license(
        db=db,
        payload=payload.payload,
        signature=payload.signature,
        request=request,
        actor_id=current_user.id,
        actor_username=current_user.username,
    )
    return await LicenseService.get_license_status(
        db=db,
        request=request,
        actor_id=current_user.id,
        actor_username=current_user.username,
    )


async def _install_license_revocations(
    *,
    request: Request,
    payload: schemas.LicenseRevocationInstallRequest,
    db: AsyncSession,
    current_user: models.User,
) -> dict:
    return await LicenseService.install_revocation_list(
        db=db,
        payload=payload.payload,
        request=request,
        actor_id=current_user.id,
        actor_username=current_user.username,
    )


async def _get_license_status(
    *,
    request: Request,
    db: AsyncSession,
    current_user: models.User,
) -> dict:
    return await LicenseService.get_license_status(
        db=db,
        request=request,
        actor_id=current_user.id,
        actor_username=current_user.username,
    )


async def _get_license_claims(
    *,
    request: Request,
    db: AsyncSession,
    current_user: models.User,
) -> dict:
    return await LicenseService.get_license_claims(
        db=db,
        request=request,
        actor_id=current_user.id,
        actor_username=current_user.username,
    )


async def _get_license_events(
    *,
    db: AsyncSession,
    limit: int,
    offset: int,
    import_only: bool = False,
) -> dict:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    base_query = select(models.LicenseEvent)
    if import_only:
        base_query = base_query.where(
            models.LicenseEvent.event_type.in_(["license.install", "license.verify_failed", "license.expired"])
        )

    total_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = int(total_result.scalar() or 0)
    result = await db.execute(
        base_query
        .order_by(models.LicenseEvent.created_at.desc())
        .offset(safe_offset)
        .limit(safe_limit)
    )
    rows = result.scalars().all()
    items = [
        {
            "id": row.id,
            "event_type": row.event_type,
            "status": row.status,
            "reason": row.reason,
            "license_id": (
                str((row.payload or {}).get("license_id") or "").strip()
                if isinstance(row.payload, dict)
                else None
            ),
            "product_id": row.product_id,
            "installation_id": row.installation_id,
            "grant_type": row.grant_type,
            "customer": row.customer,
            "actor_username": row.actor_username,
            "ip_address": row.ip_address,
            "created_at": row.created_at,
        }
        for row in rows
    ]
    return {
        "total": total,
        "limit": safe_limit,
        "offset": safe_offset,
        "items": items,
    }


@router.post("/license/install/", response_model=schemas.LicenseStatusResponse)
async def install_license_admin(
    request: Request,
    payload: schemas.LicenseInstallRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    return await _install_license(
        request=request,
        payload=payload,
        db=db,
        current_user=current_user,
    )


@router.post("/license/revocations/install/", response_model=schemas.LicenseRevocationInstallResponse)
async def install_license_revocations_admin(
    request: Request,
    payload: schemas.LicenseRevocationInstallRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    return await _install_license_revocations(
        request=request,
        payload=payload,
        db=db,
        current_user=current_user,
    )


@router.get("/license/status/", response_model=schemas.LicenseStatusResponse)
async def get_license_status_admin(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    return await _get_license_status(
        request=request,
        db=db,
        current_user=current_user,
    )


@router.get("/license/claims/", response_model=schemas.LicenseClaimsResponse)
async def get_license_claims_admin(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    return await _get_license_claims(
        request=request,
        db=db,
        current_user=current_user,
    )


@router.get("/license/events/", response_model=schemas.LicenseEventListResponse)
async def get_license_events_admin(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    import_only: bool = Query(False),
    db: AsyncSession = Depends(database.get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    return await _get_license_events(
        db=db,
        limit=limit,
        offset=offset,
        import_only=import_only,
    )


@license_alias_router.post("/install/", response_model=schemas.LicenseStatusResponse)
async def install_license_alias(
    request: Request,
    payload: schemas.LicenseInstallRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    return await _install_license(
        request=request,
        payload=payload,
        db=db,
        current_user=current_user,
    )


@license_alias_router.post("/revocations/install/", response_model=schemas.LicenseRevocationInstallResponse)
async def install_license_revocations_alias(
    request: Request,
    payload: schemas.LicenseRevocationInstallRequest,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    return await _install_license_revocations(
        request=request,
        payload=payload,
        db=db,
        current_user=current_user,
    )


@license_alias_router.get("/status/", response_model=schemas.LicenseStatusResponse)
async def get_license_status_alias(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    return await _get_license_status(
        request=request,
        db=db,
        current_user=current_user,
    )


@license_alias_router.get("/claims/", response_model=schemas.LicenseClaimsResponse)
async def get_license_claims_alias(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    return await _get_license_claims(
        request=request,
        db=db,
        current_user=current_user,
    )


@license_alias_router.get("/events/", response_model=schemas.LicenseEventListResponse)
async def get_license_events_alias(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    import_only: bool = Query(False),
    db: AsyncSession = Depends(database.get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    return await _get_license_events(
        db=db,
        limit=limit,
        offset=offset,
        import_only=import_only,
    )


@router.get("/info")
async def get_system_info(
    request: Request,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    """Get system version and status information."""
    try:
        await db.execute(select(1))
        db_status = "已连接"
    except Exception:
        db_status = "连接失败"

    configured_public_base = os.getenv("PORTAL_PUBLIC_BASE_URL", "").strip()
    if not configured_public_base:
        config_result = await db.execute(
            select(models.SystemConfig).where(
                models.SystemConfig.key.in_(["platform_public_base_url", "platform_domain"])
            )
        )
        config_items = {item.key: item.value for item in config_result.scalars().all()}
        configured_public_base = str(config_items.get("platform_public_base_url") or "").strip()
        if not configured_public_base:
            domain = str(config_items.get("platform_domain") or "").strip()
            if domain:
                configured_public_base = f"https://{domain}"
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

    # Keep dashboard system-info aligned with the currently installed license state.
    try:
        license_status_payload = await LicenseService.get_license_status(
            db,
            request=request,
            actor_id=current_user.id,
            actor_username=current_user.username,
        )
    except Exception as exc:
        logger.warning("Failed to load license status for system info: %s", exc)
        license_status_payload = {
            "installed": False,
            "status": "missing",
            "reason": "LICENSE_STATUS_UNAVAILABLE",
            "installation_id": _build_system_serial_number(),
            "grant_type": None,
            "customer": None,
            "expires_at": None,
        }

    serial_number = str(license_status_payload.get("installation_id") or _build_system_serial_number())
    license_status = str(license_status_payload.get("status") or "missing")
    license_reason = str(license_status_payload.get("reason") or "")
    license_expires_at = license_status_payload.get("expires_at")
    license_type = license_status_payload.get("grant_type")
    license_expired = (
        license_status.lower() == "expired"
        or license_reason.upper() == "LICENSE_EXPIRED"
    )

    return {
        "software_name": version_info["product"],
        "product_id": version_info.get("product_id", "enterprise-portal"),
        "version": version_info["version"],
        "status": "运行中",
        "database": db_status,
        "serial_number": serial_number,
        "license_id": serial_number,  # Backward compatibility for old frontend field name.
        "license_type": license_type,
        "license_status": license_status,
        "license_expires_at": license_expires_at,
        "license_expired": license_expired,
        "authorized_unit": str(license_status_payload.get("customer") or "-"),
        "access_address": access_address,
        "environment": "生产环境",
        "copyright": "© 2026 ShiKu Inc. All rights reserved.",
        "git_sha": version_info["git_sha"],
        "git_ref": version_info.get("git_ref", "unknown"),
        "dirty": version_info.get("dirty", False),
        "build_time": version_info["build_time"],
        "build_id": version_info.get("build_id", "unknown"),
        "release_id": version_info.get("release_id", "unknown"),
        "channel": version_info.get("channel", "dev"),
        "semver": version_info.get("semver", "0.0.0"),
        "api_version": version_info.get("api_version", "v1"),
    }


@router.get("/hardware", response_model=Dict[str, Any])
async def get_system_hardware(
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    payload = _get_hardware_fingerprint_payload()
    host_payload = dict(payload.get("host") or {})
    host_payload.pop("mac", None)
    payload["host"] = host_payload
    return payload


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
        "git_ref": version_info.get("git_ref", "unknown"),
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


@router.get("/backups", response_model=list[Dict[str, Any]])
async def list_system_backups(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    config_map = await _load_system_config_map(db)
    target_path = str(config_map.get("backup_target_path") or "").strip()
    if not target_path:
        return []

    backup_root = Path(target_path).expanduser()
    if not backup_root.exists() or not backup_root.is_dir():
        return []

    entries = _list_backup_entries(backup_root)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="LIST_SYSTEM_BACKUPS",
        target="系统配置快照备份",
        detail=f"path={backup_root}, count={len(entries)}",
        ip_address=ip,
        trace_id=trace_id,
        domain="SYSTEM",
    )
    return entries


@router.post("/backups", response_model=Dict[str, Any])
async def create_system_backup(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    config_map = await _load_system_config_map(db)
    backup_root = _require_backup_root(config_map, create=True)

    raw_config_result = await db.execute(select(models.SystemConfig).order_by(models.SystemConfig.key))
    raw_config_entries = {
        cfg.key: cfg.value
        for cfg in raw_config_result.scalars().all()
        if cfg.key not in BACKUP_EPHEMERAL_CONFIG_KEYS
    }

    version_info = _load_version_info()
    snapshot_payload = {
        "backup_kind": BACKUP_SNAPSHOT_KIND,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": {
            "id": current_user.id,
            "username": current_user.username,
        },
        "target_type": str(config_map.get("backup_target_type") or "local"),
        "target_path": str(backup_root),
        "version_info": version_info,
        "system_config": raw_config_entries,
    }

    backup_file = backup_root / _build_backup_snapshot_name()
    backup_file.write_text(
        json.dumps(snapshot_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    entry = _build_backup_entry(backup_file, snapshot_payload)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="CREATE_SYSTEM_BACKUP",
        target="系统配置快照备份",
        detail=f"name={entry['name']}, path={entry['path']}, keys={len(raw_config_entries)}",
        ip_address=ip,
        trace_id=trace_id,
        domain="SYSTEM",
    )
    return entry


@router.get("/backups/{backup_name}/preview", response_model=Dict[str, Any])
async def preview_system_backup(
    backup_name: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    config_map = await _load_system_config_map(db)
    backup_root = _require_backup_root(config_map, create=False)
    backup_file = _resolve_backup_file(backup_root, backup_name)
    snapshot_payload = _read_backup_snapshot(backup_file)

    if snapshot_payload.get("backup_kind") != BACKUP_SNAPSHOT_KIND:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_KIND_UNSUPPORTED", "message": "当前仅支持系统配置快照预览"},
        )

    snapshot_items = snapshot_payload.get("system_config")
    if not isinstance(snapshot_items, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_CONTENT_EMPTY", "message": "备份文件中没有可预览的系统配置"},
        )

    current_raw_result = await db.execute(select(models.SystemConfig).order_by(models.SystemConfig.key))
    current_raw_items = {
        cfg.key: cfg.value
        for cfg in current_raw_result.scalars().all()
        if cfg.key not in BACKUP_EPHEMERAL_CONFIG_KEYS
    }
    filtered_snapshot_items = {
        str(key): value
        for key, value in snapshot_items.items()
        if str(key) not in BACKUP_EPHEMERAL_CONFIG_KEYS
    }

    preview_payload = _build_backup_preview(
        backup_entry=_build_backup_entry(backup_file, snapshot_payload),
        snapshot_items=filtered_snapshot_items,
        current_items=current_raw_items,
    )

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="PREVIEW_SYSTEM_BACKUP",
        target="系统配置快照备份",
        detail=(
            f"name={backup_file.name}, "
            f"create_count={preview_payload['summary']['create_count']}, "
            f"update_count={preview_payload['summary']['update_count']}"
        ),
        ip_address=ip,
        trace_id=trace_id,
        domain="SYSTEM",
    )
    return preview_payload


@router.post("/backups/{backup_name}/restore", response_model=Dict[str, str])
async def restore_system_backup(
    backup_name: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    config_map = await _load_system_config_map(db)
    backup_root = _require_backup_root(config_map, create=False)
    backup_file = _resolve_backup_file(backup_root, backup_name)
    snapshot_payload = _read_backup_snapshot(backup_file)

    if snapshot_payload.get("backup_kind") != BACKUP_SNAPSHOT_KIND:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_KIND_UNSUPPORTED", "message": "当前仅支持系统配置快照恢复"},
        )

    raw_items = snapshot_payload.get("system_config")
    if not isinstance(raw_items, dict) or not raw_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BACKUP_CONTENT_EMPTY", "message": "备份文件中没有可恢复的系统配置"},
        )

    restored_items = {
        str(key): value
        for key, value in raw_items.items()
        if str(key) not in BACKUP_EPHEMERAL_CONFIG_KEYS
    }
    await _upsert_raw_system_config_entries(db, restored_items)
    await db.commit()

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="RESTORE_SYSTEM_BACKUP",
        target="系统配置快照备份",
        detail=f"name={backup_file.name}, restored_keys={len(restored_items)}",
        ip_address=ip,
        trace_id=trace_id,
        domain="SYSTEM",
    )
    return {"message": "系统配置已从备份恢复"}


@router.delete("/backups/{backup_name}", response_model=Dict[str, str])
async def delete_system_backup(
    backup_name: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    config_map = await _load_system_config_map(db)
    backup_root = _require_backup_root(config_map, create=False)
    backup_file = _resolve_backup_file(backup_root, backup_name)
    if not backup_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BACKUP_NOT_FOUND", "message": "备份文件不存在"},
        )

    backup_file.unlink()

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="DELETE_SYSTEM_BACKUP",
        target="系统配置快照备份",
        detail=f"name={backup_file.name}, path={backup_file}",
        ip_address=ip,
        trace_id=trace_id,
        domain="SYSTEM",
    )
    return {"message": "备份文件已删除"}


@router.post("/optimize-storage")
async def optimize_storage(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    """Trigger immediate log cleanup + database optimization."""
    await cleanup_logs(database.SessionLocal)
    optimize_ok = await optimize_database(database.SessionLocal, database.engine)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="OPTIMIZE_STORAGE",
        target="日志与数据库",
        detail=f"optimize_database_success={optimize_ok}",
        ip_address=ip,
        trace_id=trace_id,
        domain="SYSTEM",
    )

    return {
        "ok": optimize_ok,
        "message": (
            "Storage optimization completed"
            if optimize_ok
            else "Storage cleanup completed, database optimize partially failed"
        ),
    }
