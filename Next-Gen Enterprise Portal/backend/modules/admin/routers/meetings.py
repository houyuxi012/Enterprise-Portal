from __future__ import annotations

from datetime import datetime
from typing import Iterable
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import Select, asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from application.admin_app import AuditService
from core.database import get_db
from core.dependencies import PermissionChecker
import modules.models as models
import modules.schemas as schemas

router = APIRouter(
    prefix="/meetings",
    tags=["meetings"],
)


MEETING_TYPE_LABELS = {
    "online": "线上",
    "offline": "线下",
}


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


def _build_meeting_id() -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
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


def _validate_payload(payload: schemas.AdminMeetingCreate) -> tuple[str, str, str, list[str]]:
    subject = _normalize_string(payload.subject)
    organizer = _normalize_string(payload.organizer)
    meeting_room = _normalize_string(payload.meeting_room)
    attendees = _normalize_attendees(payload.attendees)

    if not subject:
        raise HTTPException(status_code=400, detail="会议主题不能为空")
    if not organizer:
        raise HTTPException(status_code=400, detail="会议发起人不能为空")
    if not meeting_room:
        raise HTTPException(status_code=400, detail="会议室不能为空")
    if payload.duration_minutes <= 0:
        raise HTTPException(status_code=400, detail="会议时长必须大于 0")
    if not attendees:
        raise HTTPException(status_code=400, detail="请至少填写一位参会人")

    return subject, organizer, meeting_room, attendees


async def _fetch_meeting_or_404(db: AsyncSession, meeting_pk: int) -> models.AdminMeeting:
    result = await db.execute(
        select(models.AdminMeeting).where(models.AdminMeeting.id == meeting_pk)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="会议不存在")
    return meeting


@router.get("/", response_model=list[schemas.AdminMeeting])
async def list_admin_meetings(
    q: str | None = Query(default=None),
    meeting_type: schemas.MeetingType | None = Query(default=None),
    start_from: datetime | None = Query(default=None),
    start_to: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionChecker("admin:access")),
):
    query: Select[tuple[models.AdminMeeting]] = (
        select(models.AdminMeeting)
        .where(models.AdminMeeting.source == "local")
    )
    normalized_query = _normalize_string(q or "")
    if normalized_query:
        query = query.where(models.AdminMeeting.subject.ilike(f"%{normalized_query}%"))
    if meeting_type is not None:
        query = query.where(models.AdminMeeting.meeting_type == meeting_type)
    if start_from is not None:
        query = query.where(models.AdminMeeting.start_time >= start_from)
    if start_to is not None:
        query = query.where(models.AdminMeeting.start_time <= start_to)

    query = query.order_by(asc(models.AdminMeeting.start_time), asc(models.AdminMeeting.id))
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/", response_model=schemas.AdminMeeting, status_code=status.HTTP_201_CREATED)
async def create_admin_meeting(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.AdminMeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("admin:access")),
):
    subject, organizer, meeting_room, attendees = _validate_payload(payload)

    normalized_meeting_id = _normalize_string(payload.meeting_id)
    meeting_id = normalized_meeting_id or await _generate_unique_meeting_id(db)

    existing = await db.execute(
        select(models.AdminMeeting.id).where(models.AdminMeeting.meeting_id == meeting_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="会议 ID 已存在，请更换后重试")

    meeting = models.AdminMeeting(
        subject=subject,
        start_time=payload.start_time,
        duration_minutes=payload.duration_minutes,
        meeting_type=payload.meeting_type,
        meeting_room=meeting_room,
        meeting_id=meeting_id,
        organizer=organizer,
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
        action="ADMIN_CREATE_MEETING",
        target=f"meeting:{meeting.id}",
        detail=(
            f"subject={meeting.subject}, meeting_id={meeting.meeting_id}, "
            f"type={MEETING_TYPE_LABELS.get(meeting.meeting_type, meeting.meeting_type)}, attendees={len(attendees)}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return meeting


@router.put("/{meeting_pk}", response_model=schemas.AdminMeeting)
async def update_admin_meeting(
    meeting_pk: int,
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.AdminMeetingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("admin:access")),
):
    meeting = await _fetch_meeting_or_404(db, meeting_pk)
    subject, organizer, meeting_room, attendees = _validate_payload(payload)

    normalized_meeting_id = _normalize_string(payload.meeting_id)
    next_meeting_id = normalized_meeting_id or meeting.meeting_id
    if next_meeting_id != meeting.meeting_id:
        existing = await db.execute(
            select(models.AdminMeeting.id).where(
                models.AdminMeeting.meeting_id == next_meeting_id,
                models.AdminMeeting.id != meeting_pk,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="会议 ID 已存在，请更换后重试")

    meeting.subject = subject
    meeting.start_time = payload.start_time
    meeting.duration_minutes = payload.duration_minutes
    meeting.meeting_type = payload.meeting_type
    meeting.meeting_room = meeting_room
    meeting.meeting_id = next_meeting_id
    meeting.organizer = organizer
    meeting.attendees = attendees

    await db.commit()
    await db.refresh(meeting)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_UPDATE_MEETING",
        target=f"meeting:{meeting.id}",
        detail=(
            f"subject={meeting.subject}, meeting_id={meeting.meeting_id}, "
            f"type={MEETING_TYPE_LABELS.get(meeting.meeting_type, meeting.meeting_type)}, attendees={len(attendees)}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return meeting


@router.delete("/{meeting_pk}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_meeting(
    meeting_pk: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("admin:access")),
):
    meeting = await _fetch_meeting_or_404(db, meeting_pk)
    subject = meeting.subject
    meeting_id = meeting.meeting_id

    await db.delete(meeting)
    await db.commit()

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_DELETE_MEETING",
        target=f"meeting:{meeting_pk}",
        detail=f"subject={subject}, meeting_id={meeting_id}",
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return None
