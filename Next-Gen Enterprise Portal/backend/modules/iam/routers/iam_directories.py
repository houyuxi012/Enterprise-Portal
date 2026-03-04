from __future__ import annotations

import logging
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete as sa_delete, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
import modules.schemas as schemas
from iam.audit.service import IAMAuditService
from iam.deps import PermissionChecker, get_db, verify_admin_aud
from modules.iam.services.crypto_keyring import BindPasswordKeyring, KeyringConfigError
from modules.iam.services.identity.identity_service import ProviderIdentityService
from modules.iam.services.identity.providers import IdentityProviderError, LdapIdentityProvider
from modules.admin.services.license_service import LicenseService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/directories",
    tags=["iam-directories"],
    dependencies=[Depends(verify_admin_aud)],
)


def _directory_bind_aad(directory_id: int) -> bytes:
    return b"bind_password:" + str(int(directory_id)).encode("utf-8")


def _to_out(config: models.DirectoryConfig) -> schemas.DirectoryConfigOut:
    sync_mode = str(config.sync_mode or "manual").lower()
    sync_interval = int(config.sync_interval_minutes) if config.sync_interval_minutes is not None else None
    return schemas.DirectoryConfigOut(
        id=config.id,
        name=config.name,
        type=str(config.type or "ldap").lower(),
        host=config.host,
        port=config.port,
        use_ssl=bool(config.use_ssl),
        start_tls=bool(config.start_tls),
        bind_dn=config.bind_dn,
        remark=config.remark,
        base_dn=config.base_dn,
        user_filter=config.user_filter,
        username_attr=config.username_attr,
        email_attr=config.email_attr,
        display_name_attr=config.display_name_attr,
        mobile_attr=config.mobile_attr or "mobile",
        avatar_attr=config.avatar_attr or "jpegPhoto",
        sync_mode=sync_mode if sync_mode in {"manual", "auto"} else "manual",
        sync_interval_minutes=sync_interval,
        sync_cursor=config.sync_cursor,
        enabled=bool(config.enabled),
        has_bind_password=bool(config.bind_password_ciphertext),
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


async def _audit_directory_event(
    *,
    db: AsyncSession,
    request: Request,
    actor,
    action: str,
    result: str,
    target_id: int | None = None,
    target_name: str | None = None,
    detail: dict | None = None,
    reason: str | None = None,
    ) -> None:
    await IAMAuditService.log(
        db=db,
        action=action,
        target_type="directory",
        user_id=actor.id,
        username=actor.username,
        target_id=target_id,
        target_name=target_name,
        detail=detail or {},
        result=result,
        reason=reason,
        ip_address=request.client.host if request.client else "unknown",
        user_agent=request.headers.get("User-Agent"),
        trace_id=request.headers.get("X-Request-ID"),
    )


def _type_defaults(dir_type: str) -> dict[str, str]:
    """Return type-aware attribute defaults for AD vs OpenLDAP."""
    if dir_type == "ad":
        return {
            "user_filter": "(&(objectClass=user)(sAMAccountName={username}))",
            "username_attr": "sAMAccountName",
            "email_attr": "mail",
            "display_name_attr": "displayName",
            "mobile_attr": "mobile",
            "avatar_attr": "thumbnailPhoto",
        }
    return {
        "user_filter": "(&(objectClass=inetOrgPerson)(uid={username}))",
        "username_attr": "uid",
        "email_attr": "mail",
        "display_name_attr": "cn",
        "mobile_attr": "mobile",
        "avatar_attr": "jpegPhoto",
    }


def _normalize_sync_settings(sync_mode: str | None, sync_interval_minutes: int | None) -> tuple[str, int | None]:
    normalized_mode = str(sync_mode or "manual").strip().lower()
    if normalized_mode not in {"manual", "auto"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_SYNC_MODE", "message": "sync_mode must be manual or auto"},
        )

    if normalized_mode == "manual":
        return normalized_mode, None

    if sync_interval_minutes is None:
        sync_interval_minutes = 60
    try:
        interval = int(sync_interval_minutes)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_SYNC_INTERVAL", "message": "sync_interval_minutes must be an integer"},
        )
    if interval < 5 or interval > 10080:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_SYNC_INTERVAL",
                "message": "sync_interval_minutes must be between 5 and 10080",
            },
        )
    return normalized_mode, interval


@router.post("/", response_model=schemas.DirectoryConfigOut, status_code=status.HTTP_201_CREATED)
async def create_directory_config(
    payload: schemas.DirectoryConfigCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    operator=Depends(PermissionChecker("iam:directory:manage")),
):
    await LicenseService.require_feature(db, "ldap")

    provider_type = str(payload.type or "ldap").lower()
    if provider_type not in {"ldap", "ad"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DIRECTORY_TYPE", "message": "type must be ldap or ad"},
        )
    if payload.use_ssl and payload.start_tls:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TLS_MODE", "message": "use_ssl and start_tls cannot both be enabled"},
        )
    sync_mode, sync_interval_minutes = _normalize_sync_settings(payload.sync_mode, payload.sync_interval_minutes)
    defaults = _type_defaults(provider_type)
    username_attr = str(payload.username_attr or "").strip() or defaults["username_attr"]
    email_attr = str(payload.email_attr or "").strip() or defaults["email_attr"]
    display_name_attr = str(payload.display_name_attr or "").strip() or defaults["display_name_attr"]
    mobile_attr = str(payload.mobile_attr or "").strip() or defaults["mobile_attr"]
    avatar_attr = str(payload.avatar_attr or "").strip() or defaults["avatar_attr"]

    config = models.DirectoryConfig(
        name=payload.name,
        type=provider_type,
        host=payload.host,
        port=payload.port,
        use_ssl=payload.use_ssl,
        start_tls=payload.start_tls,
        bind_dn=payload.bind_dn,
        remark=str(payload.remark).strip() if payload.remark is not None and str(payload.remark).strip() != "" else None,
        bind_password_ciphertext=None,
        base_dn=payload.base_dn,
        user_filter=str(payload.user_filter or "").strip() or defaults["user_filter"],
        username_attr=username_attr,
        email_attr=email_attr,
        display_name_attr=display_name_attr,
        mobile_attr=mobile_attr,
        avatar_attr=avatar_attr,
        sync_mode=sync_mode,
        sync_interval_minutes=sync_interval_minutes,
        enabled=payload.enabled,
    )
    if payload.enabled:
        await db.execute(update(models.DirectoryConfig).values(enabled=False))

    db.add(config)
    await db.flush()

    if payload.bind_password is not None and str(payload.bind_password).strip() != "":
        try:
            config.bind_password_ciphertext = BindPasswordKeyring.encrypt_bind_password(
                payload.bind_password,
                aad=_directory_bind_aad(config.id),
            )
        except KeyringConfigError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": e.code, "message": str(e)},
            )

    await _audit_directory_event(
        db=db,
        request=request,
        actor=operator,
        action="IAM_DIRECTORY_CREATE",
        result="success",
        target_id=config.id,
        target_name=config.name,
        detail={
            "host": config.host,
            "base_dn": config.base_dn,
            "type": config.type,
            "sync_mode": config.sync_mode,
            "sync_interval_minutes": config.sync_interval_minutes,
        },
    )
    await db.commit()
    await db.refresh(config)
    return _to_out(config)


@router.post("/test-draft", response_model=schemas.DirectoryConnectionTestResponse)
async def test_directory_connection_draft(
    payload: schemas.DirectoryConnectionDraftTestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    operator=Depends(PermissionChecker("iam:directory:manage")),
):
    await LicenseService.require_feature(db, "ldap")
    if payload.use_ssl and payload.start_tls:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TLS_MODE", "message": "use_ssl and start_tls cannot both be enabled"},
        )

    provider_type = str(payload.type or "ldap").strip().lower()
    if provider_type not in {"ldap", "ad"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_DIRECTORY_TYPE", "message": "type must be ldap or ad"},
        )

    draft_defaults = _type_defaults(provider_type)
    temp_config = SimpleNamespace(
        id=None,
        name="draft",
        type=provider_type,
        host=str(payload.host or "").strip(),
        port=int(payload.port),
        use_ssl=bool(payload.use_ssl),
        start_tls=bool(payload.start_tls),
        bind_dn=str(payload.bind_dn or "").strip() or None,
        bind_password_plain=str(payload.bind_password or ""),
        bind_password_ciphertext=None,
        base_dn=str(payload.base_dn or "").strip(),
        user_filter=str(payload.user_filter or "").strip() or draft_defaults["user_filter"],
        username_attr=str(payload.username_attr or "").strip() or draft_defaults["username_attr"],
        email_attr=str(payload.email_attr or "").strip() or draft_defaults["email_attr"],
        display_name_attr=str(payload.display_name_attr or "").strip() or draft_defaults["display_name_attr"],
        mobile_attr=str(payload.mobile_attr or "").strip() or draft_defaults["mobile_attr"],
        avatar_attr=str(payload.avatar_attr or "").strip() or draft_defaults["avatar_attr"],
    )

    provider = LdapIdentityProvider()
    try:
        result = await provider.test_connection(
            db=db,
            directory_config=temp_config,
            username=payload.username,
            password=payload.password,
            request=request,
        )
        await _audit_directory_event(
            db=db,
            request=request,
            actor=operator,
            action="IAM_DIRECTORY_TEST_DRAFT",
            result="success",
            target_name="draft",
            detail={"host": temp_config.host, "base_dn": temp_config.base_dn, "type": temp_config.type},
        )
        await db.commit()
        return schemas.DirectoryConnectionTestResponse(
            success=True,
            message=result.get("message", "Directory test succeeded"),
            matched_dn=result.get("matched_dn"),
            attributes=result.get("attributes") or {},
        )
    except IdentityProviderError as e:
        await _audit_directory_event(
            db=db,
            request=request,
            actor=operator,
            action="IAM_DIRECTORY_TEST_DRAFT",
            result="fail",
            target_name="draft",
            detail={"host": temp_config.host, "base_dn": temp_config.base_dn, "type": temp_config.type},
            reason=e.code,
        )
        await db.commit()
        raise HTTPException(status_code=e.status_code, detail={"code": e.code, "message": e.message})


@router.get("/", response_model=schemas.DirectoryConfigListResponse)
async def list_directory_configs(
    q: str | None = Query(default=None),
    directory_type: str | None = Query(default=None, alias="type"),
    enabled: bool | None = Query(default=None),
    updated_at_from: datetime | None = Query(default=None),
    updated_at_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("iam:directory:manage")),
):
    await LicenseService.require_feature(db, "ldap")
    stmt = select(models.DirectoryConfig)
    if directory_type:
        normalized_type = str(directory_type).strip().lower()
        if normalized_type not in {"ldap", "ad"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_DIRECTORY_TYPE", "message": "type must be ldap or ad"},
            )
        stmt = stmt.where(models.DirectoryConfig.type == normalized_type)

    if enabled is not None:
        stmt = stmt.where(models.DirectoryConfig.enabled == enabled)

    if updated_at_from is not None:
        stmt = stmt.where(models.DirectoryConfig.updated_at >= updated_at_from)

    if updated_at_to is not None:
        stmt = stmt.where(models.DirectoryConfig.updated_at <= updated_at_to)

    keyword = str(q or "").strip()
    if keyword:
        like_pattern = f"%{keyword}%"
        stmt = stmt.where(
            or_(
                models.DirectoryConfig.name.ilike(like_pattern),
                models.DirectoryConfig.host.ilike(like_pattern),
                models.DirectoryConfig.base_dn.ilike(like_pattern),
            )
        )

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(total_stmt)).scalar() or 0)
    total_pages = max((total + page_size - 1) // page_size, 1)
    safe_page = min(page, total_pages) if total > 0 else 1

    page_stmt = (
        stmt.order_by(desc(models.DirectoryConfig.updated_at))
        .offset((safe_page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(page_stmt)
    items = [_to_out(item) for item in result.scalars().all()]
    return schemas.DirectoryConfigListResponse(
        total=total,
        page=safe_page,
        page_size=page_size,
        total_pages=total_pages,
        items=items,
    )



# ═══════════════════════════════════════════════════════════════════════
# Global Delete-Protection Config (applies to ALL directories)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/delete-protection")
async def get_delete_protection(
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("iam:directory:manage")),
):
    """Get global delete-protection settings."""
    await LicenseService.require_feature(db, "ldap")
    grace_row = await db.execute(
        select(models.SystemConfig).filter(models.SystemConfig.key == "directory_delete_grace_days")
    )
    grace_cfg = grace_row.scalars().first()
    wl_row = await db.execute(
        select(models.SystemConfig).filter(models.SystemConfig.key == "directory_delete_whitelist")
    )
    wl_cfg = wl_row.scalars().first()
    return {
        "delete_grace_days": int(grace_cfg.value) if grace_cfg and grace_cfg.value else 7,
        "delete_whitelist": wl_cfg.value if wl_cfg else "[]",
    }


@router.put("/delete-protection")
async def update_delete_protection(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    operator=Depends(PermissionChecker("iam:directory:manage")),
):
    """Update global delete-protection settings."""
    await LicenseService.require_feature(db, "ldap")
    import json as _json

    grace_days = payload.get("delete_grace_days", 7)
    whitelist = payload.get("delete_whitelist", "[]")

    # Validate
    try:
        grace_days = max(0, min(365, int(grace_days)))
    except (TypeError, ValueError):
        grace_days = 7
    if isinstance(whitelist, list):
        whitelist = _json.dumps(whitelist, ensure_ascii=False)
    else:
        try:
            _json.loads(str(whitelist))
        except Exception:
            whitelist = "[]"

    for key, value in [("directory_delete_grace_days", str(grace_days)), ("directory_delete_whitelist", whitelist)]:
        row = await db.execute(
            select(models.SystemConfig).filter(models.SystemConfig.key == key)
        )
        existing = row.scalars().first()
        if existing:
            existing.value = value
        else:
            db.add(models.SystemConfig(key=key, value=value))

    await db.commit()

    await _audit_directory_event(
        db=db, request=request, actor=operator,
        action="IAM_DIRECTORY_UPDATE", result="success",
        target_name="全局回收保护",
        detail={"delete_grace_days": grace_days, "delete_whitelist": whitelist},
    )
    await db.commit()

    return {"delete_grace_days": grace_days, "delete_whitelist": whitelist}


@router.get("/{directory_id}", response_model=schemas.DirectoryConfigOut)
async def get_directory_config(
    directory_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("iam:directory:manage")),
):
    await LicenseService.require_feature(db, "ldap")
    config = await db.get(models.DirectoryConfig, directory_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DIRECTORY_NOT_FOUND", "message": "Directory config not found"},
        )
    return _to_out(config)


@router.put("/{directory_id}", response_model=schemas.DirectoryConfigOut)
async def update_directory_config(
    directory_id: int,
    payload: schemas.DirectoryConfigUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    operator=Depends(PermissionChecker("iam:directory:manage")),
):
    await LicenseService.require_feature(db, "ldap")
    config = await db.get(models.DirectoryConfig, directory_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DIRECTORY_NOT_FOUND", "message": "Directory config not found"},
        )

    update_data = payload.dict(exclude_unset=True)
    if "remark" in update_data:
        update_data["remark"] = (
            str(update_data["remark"]).strip()
            if update_data["remark"] is not None and str(update_data["remark"]).strip() != ""
            else None
        )
    if "type" in update_data and update_data["type"] is not None:
        update_data["type"] = str(update_data["type"]).lower()
    # Use type-aware defaults for attribute fallback
    effective_type = str(update_data.get("type", config.type) or "ldap").lower()
    update_defaults = _type_defaults(effective_type)
    for attr_key in ("username_attr", "email_attr", "display_name_attr", "mobile_attr", "avatar_attr"):
        if attr_key in update_data and update_data[attr_key] is not None:
            cleaned = str(update_data[attr_key]).strip()
            update_data[attr_key] = cleaned or update_defaults[attr_key]
    effective_use_ssl = update_data.get("use_ssl", config.use_ssl)
    effective_start_tls = update_data.get("start_tls", config.start_tls)
    if effective_use_ssl and effective_start_tls:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TLS_MODE", "message": "use_ssl and start_tls cannot both be enabled"},
        )

    sync_mode_for_check = update_data.get("sync_mode", config.sync_mode)
    sync_interval_for_check = (
        update_data["sync_interval_minutes"]
        if "sync_interval_minutes" in update_data
        else config.sync_interval_minutes
    )
    normalized_sync_mode, normalized_sync_interval = _normalize_sync_settings(
        sync_mode_for_check, sync_interval_for_check
    )
    update_data["sync_mode"] = normalized_sync_mode
    update_data["sync_interval_minutes"] = normalized_sync_interval

    bind_password_present = "bind_password" in update_data
    bind_password = update_data.pop("bind_password", None)
    if bind_password_present:
        if bind_password is None:
            pass
        elif str(bind_password).strip() == "":
            config.bind_password_ciphertext = None
        else:
            try:
                config.bind_password_ciphertext = BindPasswordKeyring.encrypt_bind_password(
                    str(bind_password),
                    aad=_directory_bind_aad(config.id),
                )
            except KeyringConfigError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": e.code, "message": str(e)},
                )

    if update_data.get("enabled"):
        await db.execute(
            update(models.DirectoryConfig)
            .where(models.DirectoryConfig.id != directory_id)
            .values(enabled=False)
        )

    for key, value in update_data.items():
        setattr(config, key, value)

    await _audit_directory_event(
        db=db,
        request=request,
        actor=operator,
        action="IAM_DIRECTORY_UPDATE",
        result="success",
        target_id=config.id,
        target_name=config.name,
        detail={
            "host": config.host,
            "base_dn": config.base_dn,
            "type": config.type,
            "sync_mode": config.sync_mode,
            "sync_interval_minutes": config.sync_interval_minutes,
            "updated_fields": list(update_data.keys()),
        },
    )
    await db.commit()
    await db.refresh(config)
    return _to_out(config)


@router.post("/{directory_id}/test", response_model=schemas.DirectoryConnectionTestResponse)
async def test_directory_connection(
    directory_id: int,
    payload: schemas.DirectoryConnectionTestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    operator=Depends(PermissionChecker("iam:directory:manage")),
):
    await LicenseService.require_feature(db, "ldap")
    config = await db.get(models.DirectoryConfig, directory_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DIRECTORY_NOT_FOUND", "message": "Directory config not found"},
        )

    provider = LdapIdentityProvider()
    try:
        result = await provider.test_connection(
            db=db,
            directory_config=config,
            username=payload.username,
            password=payload.password,
            request=request,
        )
        await _audit_directory_event(
            db=db,
            request=request,
            actor=operator,
            action="IAM_DIRECTORY_TEST",
            result="success",
            target_id=config.id,
            target_name=config.name,
            detail={"host": config.host, "base_dn": config.base_dn, "type": config.type},
        )
        await db.commit()
        return schemas.DirectoryConnectionTestResponse(
            success=True,
            message=result.get("message", "Directory test succeeded"),
            matched_dn=result.get("matched_dn"),
            attributes=result.get("attributes") or {},
        )
    except IdentityProviderError as e:
        await _audit_directory_event(
            db=db,
            request=request,
            actor=operator,
            action="IAM_DIRECTORY_TEST",
            result="fail",
            target_id=config.id,
            target_name=config.name,
            detail={"host": config.host, "base_dn": config.base_dn, "type": config.type},
            reason=e.code,
        )
        await db.commit()
        raise HTTPException(status_code=e.status_code, detail={"code": e.code, "message": e.message})
    except HTTPException as e:
        await _audit_directory_event(
            db=db,
            request=request,
            actor=operator,
            action="IAM_DIRECTORY_TEST",
            result="fail",
            target_id=config.id,
            target_name=config.name,
            detail={"host": config.host, "base_dn": config.base_dn, "type": config.type},
            reason=str((e.detail or {}).get("code") if isinstance(e.detail, dict) else "TEST_FAILED"),
        )
        await db.commit()
        raise


@router.post("/{directory_id}/sync")
async def sync_directory_now(
    directory_id: int,
    request: Request,
    is_incremental: bool = Query(False, description="Whether to perform an incremental sync using cursor"),
    db: AsyncSession = Depends(get_db),
    operator=Depends(PermissionChecker("iam:directory:manage")),
):
    """手动触发一次目录同步（组织、用户组、用户），含企业级加固。"""
    import json as _json
    import time as _time

    from modules.iam.services.identity.sync_errors import (
        SYNC_CURSOR_REGRESSION, SYNC_CURSOR_JUMP_ALERT, SYNC_CURSOR_COMMITTED,
        SYNC_DELETE_GRACE_MARKED, SYNC_DELETE_GRACE_EXPIRED, SYNC_DELETE_WHITELIST_SKIP,
        SYNC_DELETE_EXECUTED, SYNC_RECONCILE_DEPT_MISSING, SYNC_RECONCILE_UPDATED,
        SYNC_STAGE_ORGS, SYNC_STAGE_GROUPS, SYNC_STAGE_USERS,
        SYNC_STAGE_RECONCILE, SYNC_STAGE_DELETE,
        DEFAULT_CURSOR_JUMP_THRESHOLD,
    )

    await LicenseService.require_feature(db, "ldap")
    config = await db.get(models.DirectoryConfig, directory_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DIRECTORY_NOT_FOUND", "message": "Directory config not found"},
        )
    if not config.enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DIRECTORY_DISABLED", "message": "Directory is disabled, enable it first"},
        )

    provider = LdapIdentityProvider()
    sync_limit = 100000

    now = datetime.now(timezone.utc)
    synced_user_count = 0
    synced_org_count = 0
    synced_group_count = 0
    failed_count = 0
    fetched_count = 0
    removed_count = 0
    removed_users: list[str] = []
    grace_marked_count = 0

    source_label = "OpenLDAP" if str(config.type or "").lower() == "ldap" else "Active Directory"
    dir_type = str(config.type or "ldap").lower()
    
    current_cursor = config.sync_cursor if is_incremental else None

    # ── Task 4: cursor safety – detect regression ─────────────────────
    if is_incremental and current_cursor:
        # Will be compared again after sync completes
        pass

    # ── Task 1: create SyncJob ────────────────────────────────────────
    job = models.SyncJob(
        directory_id=config.id,
        job_type="incremental" if is_incremental else "full",
        status="running",
        cursor_start=current_cursor,
        stats={},
    )
    db.add(job)
    await db.flush()
    job_id = job.id

    stage_stats: dict[str, dict] = {}
    max_usn_seen: str | None = None

    def _record_stage(stage_name: str, start_ts: float, count: int, errors: int = 0):
        elapsed = round((_time.monotonic() - start_ts) * 1000, 1)
        stage_stats[stage_name] = {"count": count, "errors": errors, "duration_ms": elapsed}
        job.stats = stage_stats
        job.stage = stage_name

    try:
        # ═══════════════════════════════════════════════════════════════
        # 1. Sync Organizations (OUs) -> Departments
        # ═══════════════════════════════════════════════════════════════
        stage_start = _time.monotonic()
        orgs, orgs_cursor = await provider.sync_orgs(
            db=db, directory_config=config, limit=sync_limit, sync_cursor=current_cursor,
        )

        org_mapping: dict[str, int] = {}
        org_mapping_name: dict[str, str] = {}
        dn_to_dept: dict[str, int] = {}
        dn_to_dept_name: dict[str, str] = {}

        for org in orgs:
            try:
                async with db.begin_nested():
                    dept = await ProviderIdentityService._jit_upsert_org(db, config.id, org)
                    await db.flush()
                    org_mapping[org.external_id] = dept.id
                    org_mapping_name[org.external_id] = dept.name
                    if org.dn:
                        dn_to_dept[org.dn] = dept.id
                        dn_to_dept_name[org.dn] = dept.name
                    synced_org_count += 1
            except Exception as org_exc:
                logger.warning("Org sync upsert failed: external_id=%s err=%s", org.external_id, org_exc)

        # Establish hierarchy
        for org in orgs:
            if org.parent_external_id and org.external_id in org_mapping:
                child_id = org_mapping[org.external_id]
                parent_id = dn_to_dept.get(org.parent_external_id) or org_mapping.get(org.parent_external_id)
                if parent_id:
                    await db.execute(update(models.Department).where(models.Department.id == child_id).values(parent_id=parent_id))

        _record_stage(SYNC_STAGE_ORGS, stage_start, synced_org_count)

        # ═══════════════════════════════════════════════════════════════
        # 2. Sync Groups -> Roles
        # ═══════════════════════════════════════════════════════════════
        stage_start = _time.monotonic()
        groups, groups_cursor = await provider.sync_groups(
            db=db, directory_config=config, limit=sync_limit, sync_cursor=current_cursor,
        )
        for group in groups:
            try:
                async with db.begin_nested():
                    await ProviderIdentityService._jit_upsert_group_as_role(db, config.id, group)
                    synced_group_count += 1
            except Exception as grp_exc:
                logger.warning("Group sync upsert failed: external_id=%s err=%s", group.external_id, grp_exc)

        _record_stage(SYNC_STAGE_GROUPS, stage_start, synced_group_count)

        # ═══════════════════════════════════════════════════════════════
        # 3. Sync Users
        # ═══════════════════════════════════════════════════════════════
        stage_start = _time.monotonic()
        users, users_cursor = await provider.sync_users(
            db=db, directory_config=config, limit=sync_limit, sync_cursor=current_cursor,
        )
        fetched_count = len(users)

        ldap_external_ids: set[str] = set()

        for auth_result in users:
            try:
                async with db.begin_nested():
                    await ProviderIdentityService._jit_upsert_portal_user(
                        db,
                        auth_result=auth_result,
                        directory_id=config.id,
                        auth_source=str(config.type or "ldap").lower(),
                        org_mapping_name=org_mapping_name,
                        dn_to_dept_name=dn_to_dept_name,
                        dn_to_dept_id=dn_to_dept,
                    )
                synced_user_count += 1
                if auth_result.external_id:
                    ldap_external_ids.add(auth_result.external_id)
            except Exception as user_exc:
                failed_count += 1
                logger.warning(
                    "Manual sync user upsert failed: directory_id=%s username=%s err=%s",
                    config.id, auth_result.username, user_exc,
                )

        _record_stage(SYNC_STAGE_USERS, stage_start, synced_user_count, failed_count)

        # Track cursor high-water mark
        if users_cursor:
            max_usn_seen = users_cursor

        # ═══════════════════════════════════════════════════════════════
        # 4. Task 2: Relation reconciliation pass
        # ═══════════════════════════════════════════════════════════════
        stage_start = _time.monotonic()
        reconcile_count = 0
        local_users_for_recon = await db.execute(
            select(models.User).filter(models.User.directory_id == config.id)
        )
        for local_user in local_users_for_recon.scalars().all():
            if not local_user.external_id:
                continue
            user_dn = local_user.external_id
            # Derive expected department from DN
            parts = user_dn.split(",", 1)
            expected_dept_name = None
            expected_dept_id = None
            if len(parts) > 1:
                parent_dn = parts[1].strip()
                expected_dept_name = dn_to_dept_name.get(parent_dn)
                expected_dept_id = dn_to_dept.get(parent_dn)

            if expected_dept_name is None and expected_dept_id is None:
                logger.debug("reconcile_skip code=%s user=%s dn=%s", SYNC_RECONCILE_DEPT_MISSING, local_user.username, user_dn)
                continue

            # Check and correct employee
            emp_q = await db.execute(
                select(models.Employee).filter(models.Employee.account == local_user.username)
            )
            emp = emp_q.scalars().first()
            if emp:
                changed = False
                if expected_dept_name and emp.department != expected_dept_name:
                    emp.department = expected_dept_name
                    changed = True
                if expected_dept_id and emp.primary_department_id != expected_dept_id:
                    emp.primary_department_id = expected_dept_id
                    changed = True
                if changed:
                    reconcile_count += 1
                    logger.info("reconcile code=%s user=%s dept=%s", SYNC_RECONCILE_UPDATED, local_user.username, expected_dept_name)

        _record_stage(SYNC_STAGE_RECONCILE, stage_start, reconcile_count)

        # ═══════════════════════════════════════════════════════════════
        # 5. Task 5: Delete protection with grace period + whitelist
        # ═══════════════════════════════════════════════════════════════
        if not is_incremental:
            stage_start = _time.monotonic()
            # Read global delete-protection settings from SystemConfig
            _grace_row = await db.execute(
                select(models.SystemConfig).filter(models.SystemConfig.key == "directory_delete_grace_days")
            )
            _grace_cfg = _grace_row.scalars().first()
            grace_days = int(_grace_cfg.value) if _grace_cfg and _grace_cfg.value else 7
            _wl_row = await db.execute(
                select(models.SystemConfig).filter(models.SystemConfig.key == "directory_delete_whitelist")
            )
            _wl_cfg = _wl_row.scalars().first()
            whitelist_rules: list[dict] = []
            if _wl_cfg and _wl_cfg.value:
                try:
                    whitelist_rules = _json.loads(_wl_cfg.value)
                except Exception:
                    logger.warning("Invalid global delete_whitelist JSON")

            local_users_result = await db.execute(
                select(models.User).filter(models.User.directory_id == config.id)
            )
            local_users = local_users_result.scalars().all()

            for local_user in local_users:
                if local_user.external_id and local_user.external_id not in ldap_external_ids:
                    username_to_check = local_user.username
                    user_dn = local_user.external_id

                    # Whitelist check
                    is_protected = False
                    for rule in whitelist_rules:
                        rule_type = rule.get("type", "")
                        pattern = rule.get("pattern", "")
                        if rule_type == "username" and pattern == username_to_check:
                            is_protected = True
                        elif rule_type == "ou" and f"ou={pattern}," in user_dn.lower():
                            is_protected = True
                        elif rule_type == "group" and pattern:
                            is_protected = True  # simplified group match
                        if is_protected:
                            break

                    if is_protected:
                        logger.info("delete_whitelist_skip code=%s user=%s", SYNC_DELETE_WHITELIST_SKIP, username_to_check)
                        await _audit_directory_event(
                            db=db, request=request, actor=operator,
                            action="IAM_DIRECTORY_SYNC_DELETE_SKIP",
                            result="success", target_name=username_to_check,
                            detail={"reason": "whitelist_protected", "rule": rule},
                        )
                        continue

                    # Grace period logic
                    if local_user.pending_delete_at is None:
                        # First time missing: mark for grace period & disable immediately
                        local_user.pending_delete_at = now
                        local_user.status = "disabled"
                        db.add(local_user)
                        grace_marked_count += 1
                        logger.info("delete_grace_marked code=%s user=%s", SYNC_DELETE_GRACE_MARKED, username_to_check)
                        await _audit_directory_event(
                            db=db, request=request, actor=operator,
                            action="IAM_DIRECTORY_SYNC_GRACE_MARK",
                            result="success", target_name=username_to_check,
                            detail={
                                "directory_id": config.id,
                                "grace_days": grace_days,
                                "marked_at": now.isoformat(),
                                "action": "disabled",
                            },
                        )
                    else:
                        # Already marked – check if grace expired
                        from datetime import timedelta
                        if now >= local_user.pending_delete_at + timedelta(days=grace_days):
                            # Grace expired – execute deletion
                            user_id_to_remove = local_user.id

                            # Snapshot before state for audit
                            before_snapshot = {
                                "id": user_id_to_remove,
                                "username": username_to_check,
                                "email": local_user.email,
                                "name": local_user.name,
                                "directory_id": config.id,
                                "external_id": local_user.external_id,
                                "pending_delete_at": local_user.pending_delete_at.isoformat() if local_user.pending_delete_at else None,
                            }

                            await db.execute(
                                sa_delete(models.UserPasswordHistory).where(
                                    models.UserPasswordHistory.user_id == user_id_to_remove
                                )
                            )
                            await db.execute(
                                sa_delete(models.AnnouncementRead).where(
                                    models.AnnouncementRead.user_id == user_id_to_remove
                                )
                            )
                            emp_result = await db.execute(
                                select(models.Employee).filter(models.Employee.account == username_to_check)
                            )
                            emp = emp_result.scalars().first()
                            if emp:
                                await db.delete(emp)

                            await db.delete(local_user)
                            removed_count += 1
                            removed_users.append(username_to_check)

                            logger.info("delete_executed code=%s user=%s", SYNC_DELETE_EXECUTED, username_to_check)
                            await _audit_directory_event(
                                db=db, request=request, actor=operator,
                                action="IAM_DIRECTORY_SYNC_USER_REMOVED",
                                result="success",
                                target_id=user_id_to_remove,
                                target_name=username_to_check,
                                detail={
                                    "directory_id": config.id,
                                    "directory_name": config.name,
                                    "source": source_label,
                                    "reason": f"Grace期满({grace_days}天)，{source_label}数据源中该用户不存在",
                                    "before": before_snapshot,
                                    "after": "deleted",
                                    "removed_at": now.isoformat(),
                                },
                            )
                        else:
                            logger.debug("delete_grace_pending user=%s days_left=%s",
                                username_to_check,
                                grace_days - (now - local_user.pending_delete_at).days)

            _record_stage(SYNC_STAGE_DELETE, stage_start, removed_count)

        # ═══════════════════════════════════════════════════════════════
        # Task 4: Cursor safety – only commit on success
        # ═══════════════════════════════════════════════════════════════
        new_cursor = users_cursor
        cursor_warning = None

        if new_cursor and current_cursor:
            if dir_type == "ad":
                try:
                    new_val = int(new_cursor)
                    old_val = int(current_cursor)
                    if new_val < old_val:
                        cursor_warning = SYNC_CURSOR_REGRESSION
                        logger.error(
                            "cursor_regression code=%s old=%s new=%s → forcing full sync next time",
                            SYNC_CURSOR_REGRESSION, current_cursor, new_cursor,
                        )
                        # Do not update cursor; next incremental will re-fetch from old cursor
                        new_cursor = None
                    elif new_val - old_val > DEFAULT_CURSOR_JUMP_THRESHOLD:
                        cursor_warning = SYNC_CURSOR_JUMP_ALERT
                        logger.warning(
                            "cursor_jump code=%s old=%s new=%s delta=%d threshold=%d",
                            SYNC_CURSOR_JUMP_ALERT, current_cursor, new_cursor,
                            new_val - old_val, DEFAULT_CURSOR_JUMP_THRESHOLD,
                        )
                except ValueError:
                    pass
            else:
                # OpenLDAP entryCSN: lexicographic comparison
                if new_cursor < current_cursor:
                    cursor_warning = SYNC_CURSOR_REGRESSION
                    logger.error(
                        "cursor_regression code=%s old=%s new=%s",
                        SYNC_CURSOR_REGRESSION, current_cursor, new_cursor,
                    )
                    new_cursor = None

        # Commit cursor only on success
        if new_cursor:
            config.sync_cursor = new_cursor
            db.add(config)
            logger.info("cursor_committed code=%s cursor=%s", SYNC_CURSOR_COMMITTED, new_cursor)

        # Update SyncJob as success
        job.status = "success"
        job.cursor_end = new_cursor
        job.max_usn_seen = max_usn_seen
        job.finished_at = datetime.now(timezone.utc)
        job.stats = stage_stats
        if cursor_warning:
            job.error_detail = f"cursor_warning={cursor_warning}"
        db.add(job)

        # Log overall sync result
        await _audit_directory_event(
            db=db, request=request, actor=operator,
            action="IAM_DIRECTORY_SYNC",
            result="success",
            target_id=config.id,
            target_name=config.name,
            detail={
                "directory_id": config.id,
                "job_id": job_id,
                "sync_mode": "incremental_trigger" if is_incremental else "manual_trigger",
                "fetched_count": fetched_count,
                "synced_user_count": synced_user_count,
                "synced_org_count": synced_org_count,
                "synced_group_count": synced_group_count,
                "failed_count": failed_count,
                "removed_count": removed_count,
                "grace_marked_count": grace_marked_count,
                "removed_users": removed_users,
                "executed_at": now.isoformat(),
                "cursor_used": current_cursor,
                "new_cursor": new_cursor,
                "cursor_warning": cursor_warning,
                "stage_stats": stage_stats,
            },
        )
        await db.commit()
        return {
            "success": True,
            "job_id": job_id,
            "fetched_count": fetched_count,
            "synced_user_count": synced_user_count,
            "failed_count": failed_count,
            "removed_count": removed_count,
            "grace_marked_count": grace_marked_count,
            "removed_users": removed_users,
            "synced_org_count": synced_org_count,
            "synced_group_count": synced_group_count,
            "new_cursor": new_cursor,
            "cursor_warning": cursor_warning,
            "stage_stats": stage_stats,
        }
    except IdentityProviderError as e:
        # Mark job failed
        job.status = "failed"
        job.finished_at = datetime.now(timezone.utc)
        job.error_detail = f"{e.code}: {e.message}"
        job.stats = stage_stats
        db.add(job)

        await _audit_directory_event(
            db=db, request=request, actor=operator,
            action="IAM_DIRECTORY_SYNC",
            result="fail",
            target_id=config.id,
            target_name=config.name,
            detail={
                "directory_id": config.id,
                "job_id": job_id,
                "sync_mode": "manual_trigger",
                "fetched_count": fetched_count,
                "synced_user_count": synced_user_count,
                "failed_count": failed_count,
                "removed_count": removed_count,
                "removed_users": removed_users,
                "executed_at": now.isoformat(),
                "stage_stats": stage_stats,
            },
            reason=e.code,
        )
        await db.commit()
        raise HTTPException(status_code=e.status_code, detail={"code": e.code, "message": e.message})
