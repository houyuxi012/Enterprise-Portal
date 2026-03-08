from __future__ import annotations

from datetime import datetime, time, timedelta
import secrets
from typing import Iterable

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import Select, asc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from application.admin_app import AuditService
from core.database import get_db
from core.dependencies import get_current_user
from core.time_utils import utc_now
import modules.models as models
import modules.schemas as schemas

router = APIRouter(
    prefix="/meetings",
    tags=["meetings"],
)


def _normalize_string(value: str) -> str:
    return str(value or "").strip()


def _normalize_attendees(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in values:
        attendee = _normalize_string(raw)
        if not attendee:
            continue
        attendee_key = attendee.lower()
        if attendee_key in seen:
            continue
        seen.add(attendee_key)
        normalized.append(attendee)
    return normalized


def _format_user_label(user: models.User | None) -> str:
    if user is None:
        return ""
    name = _normalize_string(user.name or "")
    username = _normalize_string(user.username or "")
    if name and username:
        return f"{name} / {username}"
    return name or username


def _meeting_load_options():
    return (
        selectinload(models.AdminMeeting.organizer_user),
        selectinload(models.AdminMeeting.attendee_links).selectinload(models.AdminMeetingAttendee.user),
    )


def _resolve_organizer(meeting: models.AdminMeeting) -> str:
    return _format_user_label(meeting.organizer_user) or _normalize_string(meeting.organizer)


def _resolve_attendees(meeting: models.AdminMeeting) -> list[str]:
    attendee_users = [link.user for link in meeting.attendee_links if link.user is not None]
    labels = [_format_user_label(user) for user in attendee_users if _format_user_label(user)]
    return labels or _normalize_attendees(meeting.attendees or [])


def _serialize_portal_meeting_summary(meeting: models.AdminMeeting) -> schemas.PortalMeetingSummaryItem:
    return schemas.PortalMeetingSummaryItem(
        subject=meeting.subject,
        start_time=meeting.start_time,
        duration_minutes=meeting.duration_minutes,
        meeting_type=meeting.meeting_type,
        meeting_room=meeting.meeting_room,
        meeting_id=meeting.meeting_id,
        organizer=_resolve_organizer(meeting),
    )


def _serialize_portal_meeting_list_item(meeting: models.AdminMeeting) -> schemas.PortalMeetingListItem:
    summary = _serialize_portal_meeting_summary(meeting)
    return schemas.PortalMeetingListItem(
        **summary.model_dump(),
        attendees=_resolve_attendees(meeting),
    )


def _build_meeting_id() -> str:
    stamp = utc_now().strftime("%Y%m%d%H%M%S")
    suffix = secrets.token_hex(2).upper()
    return f"MEET-{stamp}-{suffix}"


async def _generate_unique_meeting_id(db: AsyncSession) -> str:
    while True:
        candidate = _build_meeting_id()
        existing = await db.execute(
            select(models.AdminMeeting.id).where(models.AdminMeeting.meeting_id == candidate)
        )
        if existing.scalar_one_or_none() is None:
            return candidate


def _validate_create_payload(
    payload: schemas.PortalMeetingCreate,
) -> tuple[str, str, list[str]]:
    subject = _normalize_string(payload.subject)
    meeting_room = _normalize_string(payload.meeting_room)
    attendees = _normalize_attendees(payload.attendees)

    if not subject:
        raise HTTPException(status_code=400, detail="会议主题不能为空")
    if not meeting_room:
        raise HTTPException(status_code=400, detail="会议室不能为空")
    if payload.duration_minutes <= 0:
        raise HTTPException(status_code=400, detail="会议时长必须大于 0")
    if not attendees:
        raise HTTPException(status_code=400, detail="请至少填写一位参会人")

    return subject, meeting_room, attendees


def _resolve_meeting_window(
    start_from: datetime | None,
    start_to: datetime | None,
) -> tuple[datetime, datetime]:
    if start_from is not None and start_to is not None:
        if start_from >= start_to:
            raise HTTPException(status_code=400, detail="会议时间范围无效")
        return start_from, start_to

    if start_from is not None:
        return start_from, start_from + timedelta(days=1)

    if start_to is not None:
        return start_to - timedelta(days=1), start_to

    local_now = datetime.now().astimezone()
    start_of_day = datetime.combine(local_now.date(), time.min, tzinfo=local_now.tzinfo)
    return start_of_day, start_of_day + timedelta(days=1)


@router.get("/today", response_model=schemas.PortalTodayMeetingSummary)
async def get_today_meeting_summary(
    start_from: datetime | None = Query(default=None),
    start_to: datetime | None = Query(default=None),
    current_time: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    window_start, window_end = _resolve_meeting_window(start_from, start_to)
    effective_now = current_time or datetime.now().astimezone()

    base_filters = (
        models.AdminMeeting.source == "local",
        models.AdminMeeting.start_time >= window_start,
        models.AdminMeeting.start_time < window_end,
    )

    total_stmt = select(func.count(models.AdminMeeting.id)).where(*base_filters)
    total = (await db.execute(total_stmt)).scalar_one() or 0

    next_meeting_stmt: Select[tuple[models.AdminMeeting]] = (
        select(models.AdminMeeting)
        .options(*_meeting_load_options())
        .where(*base_filters, models.AdminMeeting.start_time >= effective_now)
        .order_by(asc(models.AdminMeeting.start_time), asc(models.AdminMeeting.id))
        .limit(1)
    )
    next_meeting = (await db.execute(next_meeting_stmt)).scalar_one_or_none()

    return schemas.PortalTodayMeetingSummary(
        date=window_start.date(),
        total=int(total),
        next_meeting=_serialize_portal_meeting_summary(next_meeting) if next_meeting is not None else None,
    )


@router.get("/", response_model=list[schemas.PortalMeetingListItem])
async def list_today_meetings(
    start_from: datetime | None = Query(default=None),
    start_to: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    window_start, window_end = _resolve_meeting_window(start_from, start_to)
    stmt: Select[tuple[models.AdminMeeting]] = (
        select(models.AdminMeeting)
        .options(*_meeting_load_options())
        .where(
            models.AdminMeeting.source == "local",
            models.AdminMeeting.start_time >= window_start,
            models.AdminMeeting.start_time < window_end,
        )
        .order_by(asc(models.AdminMeeting.start_time), asc(models.AdminMeeting.id))
    )
    result = await db.execute(stmt)
    return [_serialize_portal_meeting_list_item(item) for item in result.scalars().all()]


@router.post("/", response_model=schemas.PortalMeetingListItem, status_code=status.HTTP_201_CREATED)
async def create_portal_meeting(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.PortalMeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    subject, meeting_room, attendees = _validate_create_payload(payload)
    meeting_id = await _generate_unique_meeting_id(db)
    organizer = _normalize_string(current_user.name or current_user.username or "portal-user")

    meeting = models.AdminMeeting(
        subject=subject,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        meeting_type=payload.meeting_type,
        meeting_room=meeting_room,
        meeting_id=meeting_id,
        organizer=organizer,
        organizer_user_id=current_user.id,
        attendees=attendees,
        source="local",
        created_by=current_user.id,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="PORTAL_CREATE_MEETING",
        target=f"meeting:{meeting.id}",
        detail=(
            f"subject={meeting.subject}, meeting_id={meeting.meeting_id}, "
            f"type={meeting.meeting_type}, attendees={len(attendees)}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return meeting
