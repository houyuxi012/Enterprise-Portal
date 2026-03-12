from __future__ import annotations

import logging
from typing import List

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
    payload: schemas.HolidayReminderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    reminder = models.HolidayReminder(**payload.model_dump())
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
    payload: schemas.HolidayReminderCreate,
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

    for key, value in payload.model_dump().items():
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
