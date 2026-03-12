from __future__ import annotations

import re
from typing import Iterable

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import Select, asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from application.admin_app import (
    AuditService,
    analyze_notification_template_definition,
    build_notification_sample_context,
    get_notification_email_branding,
    normalize_notification_template_i18n_map,
    normalize_notification_template_locale,
    render_notification_template,
)
from core.database import get_db
from core.dependencies import PermissionChecker
import modules.models as models
import modules.schemas as schemas

router = APIRouter(
    prefix="/notification-templates",
    tags=["notification-templates"],
)

ALLOWED_CATEGORIES = {"email", "sms", "im"}
TEMPLATE_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,63}$")


def _normalize_string(value: str | None) -> str:
    return str(value or "").strip()


def _normalize_variables(values: Iterable[str] | None) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in values or []:
        variable = _normalize_string(raw)
        if not variable:
            continue
        key = variable.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(variable)
    return normalized


def _serialize_template(template: models.NotificationTemplate) -> schemas.NotificationTemplate:
    return schemas.NotificationTemplate(
        id=template.id,
        code=template.code,
        name=template.name,
        default_locale=normalize_notification_template_locale(getattr(template, "default_locale", None)) or "zh-CN",
        name_i18n=normalize_notification_template_i18n_map(template.name_i18n),
        description=template.description,
        description_i18n=normalize_notification_template_i18n_map(template.description_i18n),
        category=template.category,
        subject=template.subject,
        subject_i18n=normalize_notification_template_i18n_map(template.subject_i18n),
        content=template.content,
        content_i18n=normalize_notification_template_i18n_map(template.content_i18n),
        variables=_normalize_variables(template.variables or []),
        is_enabled=bool(template.is_enabled),
        is_builtin=bool(template.is_builtin),
        created_by=template.created_by,
        updated_by=template.updated_by,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _build_list_query(
    *,
    category: schemas.NotificationTemplateCategory | None,
    enabled: bool | None,
) -> Select:
    query = select(models.NotificationTemplate)
    if category is not None:
        query = query.where(models.NotificationTemplate.category == category)
    if enabled is not None:
        query = query.where(models.NotificationTemplate.is_enabled == enabled)
    return query.order_by(
        asc(models.NotificationTemplate.category),
        asc(models.NotificationTemplate.is_builtin),
        asc(models.NotificationTemplate.name),
        asc(models.NotificationTemplate.id),
    )


async def _find_by_code(db: AsyncSession, code: str, exclude_id: int | None = None) -> models.NotificationTemplate | None:
    query = select(models.NotificationTemplate).where(models.NotificationTemplate.code == code)
    if exclude_id is not None:
        query = query.where(models.NotificationTemplate.id != exclude_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def _fetch_template_or_404(db: AsyncSession, template_id: int) -> models.NotificationTemplate:
    result = await db.execute(
        select(models.NotificationTemplate).where(models.NotificationTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="通知模板不存在")
    return template


def _validate_template_payload(
    payload: schemas.NotificationTemplateCreate | schemas.NotificationTemplateUpdate,
    *,
    existing: models.NotificationTemplate | None = None,
) -> dict[str, object]:
    code = _normalize_string(payload.code if payload.code is not None else getattr(existing, "code", ""))
    name = _normalize_string(payload.name if payload.name is not None else getattr(existing, "name", ""))
    default_locale = normalize_notification_template_locale(
        payload.default_locale if payload.default_locale is not None else getattr(existing, "default_locale", "zh-CN")
    ) or "zh-CN"
    name_i18n = normalize_notification_template_i18n_map(
        payload.name_i18n if payload.name_i18n is not None else getattr(existing, "name_i18n", {})
    )
    description = _normalize_string(payload.description if payload.description is not None else getattr(existing, "description", ""))
    description_i18n = normalize_notification_template_i18n_map(
        payload.description_i18n
        if payload.description_i18n is not None
        else getattr(existing, "description_i18n", {})
    )
    category = _normalize_string(payload.category if payload.category is not None else getattr(existing, "category", ""))
    subject = _normalize_string(payload.subject if payload.subject is not None else getattr(existing, "subject", ""))
    subject_i18n = normalize_notification_template_i18n_map(
        payload.subject_i18n if payload.subject_i18n is not None else getattr(existing, "subject_i18n", {})
    )
    content = _normalize_string(payload.content if payload.content is not None else getattr(existing, "content", ""))
    content_i18n = normalize_notification_template_i18n_map(
        payload.content_i18n if payload.content_i18n is not None else getattr(existing, "content_i18n", {})
    )
    variables = _normalize_variables(payload.variables if payload.variables is not None else getattr(existing, "variables", []))
    is_enabled = bool(payload.is_enabled if payload.is_enabled is not None else getattr(existing, "is_enabled", True))

    if not code:
        raise HTTPException(status_code=400, detail="模板编码不能为空")
    if not TEMPLATE_CODE_RE.match(code):
        raise HTTPException(status_code=400, detail="模板编码仅支持小写字母、数字、下划线和中划线，长度 3-64")
    if not name:
        raise HTTPException(status_code=400, detail="模板名称不能为空")
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=400, detail="模板分类不支持")
    if category == "email" and not subject:
        raise HTTPException(status_code=400, detail="邮件模板主题不能为空")
    if category != "email":
        subject = ""
        subject_i18n = {}
    if not content:
        raise HTTPException(status_code=400, detail="模板内容不能为空")

    analysis = analyze_notification_template_definition(
        category=category,
        subject=subject,
        content=content,
        declared_variables=variables,
        subject_i18n=subject_i18n,
        content_i18n=content_i18n,
    )
    if analysis["invalid_declared_variables"]:
        raise HTTPException(
            status_code=400,
            detail=f"变量名不合法: {', '.join(analysis['invalid_declared_variables'])}",
        )
    if analysis["missing_declared_variables"]:
        raise HTTPException(
            status_code=400,
            detail=f"以下占位变量未在模板变量中声明: {', '.join(analysis['missing_declared_variables'])}",
        )

    if existing is not None and bool(existing.is_builtin):
        if code != existing.code or category != existing.category:
            raise HTTPException(status_code=400, detail="内置模板不允许修改编码或分类")

    return {
        "code": code,
        "name": name,
        "default_locale": default_locale,
        "name_i18n": name_i18n,
        "description": description or None,
        "description_i18n": description_i18n,
        "category": category,
        "subject": subject or None,
        "subject_i18n": subject_i18n,
        "content": content,
        "content_i18n": content_i18n,
        "variables": analysis["declared_variables"],
        "is_enabled": is_enabled,
    }


async def _build_preview_response(
    *,
    db: AsyncSession,
    payload: schemas.NotificationTemplatePreviewRequest,
) -> schemas.NotificationTemplatePreviewResponse:
    analysis = analyze_notification_template_definition(
        category=payload.category,
        subject=payload.subject if payload.category == "email" else "",
        content=payload.content,
        declared_variables=payload.variables,
        subject_i18n=payload.subject_i18n if payload.category == "email" else {},
        content_i18n=payload.content_i18n,
    )
    template_like = models.NotificationTemplate(
        code=payload.code,
        name=payload.name,
        default_locale=normalize_notification_template_locale(payload.default_locale) or "zh-CN",
        name_i18n=normalize_notification_template_i18n_map(payload.name_i18n),
        description=payload.description,
        description_i18n=normalize_notification_template_i18n_map(payload.description_i18n),
        category=payload.category,
        subject=payload.subject if payload.category == "email" else None,
        subject_i18n=normalize_notification_template_i18n_map(payload.subject_i18n if payload.category == "email" else {}),
        content=payload.content,
        content_i18n=normalize_notification_template_i18n_map(payload.content_i18n),
        variables=analysis["declared_variables"],
        is_enabled=bool(payload.is_enabled),
        is_builtin=False,
    )
    preview_variables = {
        _normalize_string(key): _normalize_string(value)
        for key, value in (payload.preview_variables or {}).items()
        if _normalize_string(key)
    }
    preview_context = build_notification_sample_context(channel=payload.category)
    email_branding = await get_notification_email_branding(db) if payload.category == "email" else None
    if payload.category == "email":
        preview_context = build_notification_sample_context(
            channel=payload.category,
            public_base_url=str((email_branding or {}).get("public_base_url") or ""),
        )
    preview_context.update(preview_variables)
    rendered = render_notification_template(
        template_like,
        preview_context,
        locale=payload.preview_locale,
        email_branding=email_branding,
    )
    return schemas.NotificationTemplatePreviewResponse(
        validation=schemas.NotificationTemplateValidation(**analysis),
        preview=schemas.NotificationTemplatePreview(
            subject=str(rendered["subject"] or "").strip() or None,
            content=str(rendered["content"] or ""),
            html_content=str(rendered.get("html_content") or "").strip() or None,
            variables={key: str(value) for key, value in rendered["variables"].items()},
        ),
    )


@router.get("/", response_model=list[schemas.NotificationTemplate])
async def list_notification_templates(
    category: schemas.NotificationTemplateCategory | None = Query(default=None),
    enabled: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:view")),
):
    result = await db.execute(_build_list_query(category=category, enabled=enabled))
    templates = result.scalars().all()
    return [_serialize_template(template) for template in templates]


@router.post("/preview", response_model=schemas.NotificationTemplatePreviewResponse)
async def preview_notification_template(
    payload: schemas.NotificationTemplatePreviewRequest,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    return await _build_preview_response(db=db, payload=payload)


@router.post("/", response_model=schemas.NotificationTemplate, status_code=status.HTTP_201_CREATED)
async def create_notification_template(
    payload: schemas.NotificationTemplateCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    normalized = _validate_template_payload(payload)
    existing = await _find_by_code(db, str(normalized["code"]))
    if existing is not None:
        raise HTTPException(status_code=400, detail="模板编码已存在")

    template = models.NotificationTemplate(
        **normalized,
        is_builtin=False,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="CREATE_NOTIFICATION_TEMPLATE",
        target="通知模板",
        detail=f"template_id={template.id}, code={template.code}, category={template.category}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return _serialize_template(template)


@router.put("/{template_id}", response_model=schemas.NotificationTemplate)
async def update_notification_template(
    template_id: int,
    payload: schemas.NotificationTemplateUpdate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    template = await _fetch_template_or_404(db, template_id)
    normalized = _validate_template_payload(payload, existing=template)
    existing = await _find_by_code(db, str(normalized["code"]), exclude_id=template_id)
    if existing is not None:
        raise HTTPException(status_code=400, detail="模板编码已存在")

    for key, value in normalized.items():
        setattr(template, key, value)
    template.updated_by = current_user.id
    db.add(template)
    await db.commit()
    await db.refresh(template)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="UPDATE_NOTIFICATION_TEMPLATE",
        target="通知模板",
        detail=f"template_id={template.id}, code={template.code}, category={template.category}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return _serialize_template(template)


@router.patch("/{template_id}/status", response_model=schemas.NotificationTemplate)
async def update_notification_template_status(
    template_id: int,
    payload: schemas.NotificationTemplateStatusUpdate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    template = await _fetch_template_or_404(db, template_id)
    template.is_enabled = bool(payload.is_enabled)
    template.updated_by = current_user.id
    db.add(template)
    await db.commit()
    await db.refresh(template)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="TOGGLE_NOTIFICATION_TEMPLATE",
        target="通知模板",
        detail=f"template_id={template.id}, enabled={template.is_enabled}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return _serialize_template(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification_template(
    template_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("sys:settings:edit")),
):
    template = await _fetch_template_or_404(db, template_id)
    if bool(template.is_builtin):
        raise HTTPException(status_code=400, detail="内置模板不允许删除")

    await db.delete(template)
    await db.commit()

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="DELETE_NOTIFICATION_TEMPLATE",
        target="通知模板",
        detail=f"template_id={template_id}, code={template.code}, category={template.category}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return None
