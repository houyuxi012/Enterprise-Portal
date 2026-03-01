from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
from iam.audit.service import IAMAuditService
from iam.deps import PermissionChecker, get_db, verify_admin_aud
from services.crypto_keyring import BindPasswordKeyring, KeyringConfigError
from services.identity.providers import IdentityProviderError, LdapIdentityProvider
from services.license_service import LicenseService

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
        avatar_attr=config.avatar_attr or "thumbnailPhoto",
        sync_mode=sync_mode if sync_mode in {"manual", "auto"} else "manual",
        sync_interval_minutes=sync_interval,
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
    username_attr = str(payload.username_attr or "").strip() or "sAMAccountName"
    email_attr = str(payload.email_attr or "").strip() or "mail"
    display_name_attr = str(payload.display_name_attr or "").strip() or "displayName"
    mobile_attr = str(payload.mobile_attr or "").strip() or "mobile"
    avatar_attr = str(payload.avatar_attr or "").strip() or "thumbnailPhoto"

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
        user_filter=payload.user_filter,
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
        user_filter=str(payload.user_filter or "").strip() or "(&(objectClass=user)(sAMAccountName={username}))",
        username_attr=str(payload.username_attr or "").strip() or "sAMAccountName",
        email_attr=str(payload.email_attr or "").strip() or "mail",
        display_name_attr=str(payload.display_name_attr or "").strip() or "displayName",
        mobile_attr=str(payload.mobile_attr or "").strip() or "mobile",
        avatar_attr=str(payload.avatar_attr or "").strip() or "thumbnailPhoto",
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
    for attr_key, attr_default in (
        ("username_attr", "sAMAccountName"),
        ("email_attr", "mail"),
        ("display_name_attr", "displayName"),
        ("mobile_attr", "mobile"),
        ("avatar_attr", "thumbnailPhoto"),
    ):
        if attr_key in update_data and update_data[attr_key] is not None:
            cleaned = str(update_data[attr_key]).strip()
            update_data[attr_key] = cleaned or attr_default
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
