from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from application.portal_app import AuditService
from core.database import get_db
from core.dependencies import PermissionChecker
from modules.iam.routers.auth import get_current_user
import modules.models as models
import modules.schemas as schemas

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/holiday-reminders",
    tags=["holiday-reminders"],
)


def _normalize_holiday_activity_payload(payload: dict) -> dict:
    activity_mode = str(payload.get("activity_mode") or "off").strip().lower()
    if activity_mode not in {"off", "external", "local"}:
        raise HTTPException(status_code=400, detail="节日活动配置无效。")

    payload["activity_mode"] = activity_mode

    if activity_mode == "off":
        payload["activity_url"] = None
        payload["local_content_config"] = None
        return payload

    if activity_mode == "external":
        activity_url = str(payload.get("activity_url") or "").strip()
        if not activity_url:
            raise HTTPException(status_code=400, detail="外部链接不能为空。")
        payload["activity_url"] = activity_url
        payload["local_content_config"] = None
        return payload

    local_content_config = payload.get("local_content_config")
    if local_content_config is None:
        local_content_config = {}
    if isinstance(local_content_config, str):
        local_content_config = local_content_config.strip()
        if local_content_config:
            try:
                local_content_config = json.loads(local_content_config)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="节日活动本地内容格式无效。") from exc
        else:
            local_content_config = {}
    if not isinstance(local_content_config, dict):
        raise HTTPException(status_code=400, detail="节日活动本地内容格式无效。")

    payload["local_content_config"] = local_content_config
    payload["activity_url"] = None
    return payload


def _parse_holiday_date(raw_value: Any) -> date:
    if isinstance(raw_value, date) and not isinstance(raw_value, datetime):
        return raw_value
    if isinstance(raw_value, datetime):
        return raw_value.date()
    if isinstance(raw_value, str):
        value = raw_value.strip()
        if not value:
            raise HTTPException(status_code=400, detail="节日日期不能为空。")
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="节日日期格式无效。") from exc
    raise HTTPException(status_code=400, detail="节日日期格式无效。")


def _normalize_holiday_payload(payload: dict[str, Any]) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="节日名称不能为空。")

    content = str(payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="展示文案不能为空。")

    normalized_payload: dict[str, Any] = {
        "title": title,
        "content": content,
        "holiday_date": _parse_holiday_date(payload.get("holiday_date")),
        "cover_image": str(payload.get("cover_image") or "").strip() or None,
        "color": str(payload.get("color") or "purple").strip() or "purple",
        "is_active": bool(payload.get("is_active", True)),
        "activity_mode": payload.get("activity_mode"),
        "activity_url": payload.get("activity_url"),
        "local_content_config": payload.get("local_content_config"),
    }
    return _normalize_holiday_activity_payload(normalized_payload)


@router.get("/", response_model=List[schemas.HolidayReminder])
async def read_holiday_reminders(
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.HolidayReminder).order_by(
            asc(models.HolidayReminder.holiday_date),
            desc(models.HolidayReminder.id),
        )
    )
    return result.scalars().all()


@router.post(
    "/",
    response_model=schemas.HolidayReminder,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("content:announcement:edit"))],
)
async def create_holiday_reminder(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    reminder_payload = _normalize_holiday_payload(payload)
    reminder = models.HolidayReminder(**reminder_payload)
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="CREATE_HOLIDAY_REMINDER",
        target=f"节日提醒:{reminder.id} ({reminder.title})",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="CONTENT",
    )
    return reminder


@router.put(
    "/{reminder_id}",
    response_model=schemas.HolidayReminder,
    dependencies=[Depends(PermissionChecker("content:announcement:edit"))],
)
async def update_holiday_reminder(
    reminder_id: int,
    payload: dict[str, Any],
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.HolidayReminder).where(models.HolidayReminder.id == reminder_id)
    )
    reminder = result.scalars().first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Holiday reminder not found")

    normalized_payload = _normalize_holiday_payload(payload)
    for key, value in normalized_payload.items():
        setattr(reminder, key, value)

    await db.commit()
    await db.refresh(reminder)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="UPDATE_HOLIDAY_REMINDER",
        target=f"节日提醒:{reminder.id} ({reminder.title})",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="CONTENT",
    )
    return reminder


@router.delete(
    "/{reminder_id}",
    dependencies=[Depends(PermissionChecker("content:announcement:edit"))],
)
async def delete_holiday_reminder(
    reminder_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.HolidayReminder).where(models.HolidayReminder.id == reminder_id)
    )
    reminder = result.scalars().first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Holiday reminder not found")

    title = reminder.title
    await db.delete(reminder)
    await db.commit()

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="DELETE_HOLIDAY_REMINDER",
        target=f"节日提醒:{reminder_id} ({title})",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="CONTENT",
    )
    return {"ok": True}
