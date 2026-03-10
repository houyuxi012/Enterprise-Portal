from __future__ import annotations

from datetime import datetime
from typing import Iterable
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import Select, String, and_, asc, cast, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from application.admin_app import AuditService
from core.database import get_db
from core.dependencies import PermissionChecker
from core.time_utils import utc_now
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


def _normalize_user_ids(values: Iterable[int]) -> list[int]:
    seen: set[int] = set()
    normalized: list[int] = []
    for raw in values:
        try:
            user_id = int(raw)
        except (TypeError, ValueError):
            continue
        if user_id <= 0 or user_id in seen:
            continue
        seen.add(user_id)
        normalized.append(user_id)
    return normalized


def _format_user_label(user: models.User | None) -> str:
    if user is None:
        return ""
    display_name = _normalize_string(user.name or "")
    username = _normalize_string(user.username or "")
    if display_name and username:
        return f"{display_name} / {username}"
    return display_name or username


def _serialize_user_ref(user: models.User | None) -> schemas.AdminMeetingUserRef | None:
    if user is None:
        return None
    return schemas.AdminMeetingUserRef(
        id=user.id,
        username=user.username,
        name=user.name,
    )


def _serialize_admin_meeting(meeting: models.AdminMeeting) -> schemas.AdminMeeting:
    organizer_user = meeting.organizer_user
    attendee_users = [link.user for link in meeting.attendee_links if link.user is not None]
    organizer_label = _format_user_label(organizer_user) or _normalize_string(meeting.organizer)
    attendee_labels = [_format_user_label(user) for user in attendee_users if _format_user_label(user)]
    if not attendee_labels:
        attendee_labels = _normalize_attendees(meeting.attendees or [])

    return schemas.AdminMeeting(
        id=meeting.id,
        subject=meeting.subject,
        start_time=meeting.start_time,
        duration_minutes=meeting.duration_minutes,
        meeting_type=meeting.meeting_type,
        meeting_room=meeting.meeting_room,
        meeting_id=meeting.meeting_id,
        organizer=organizer_label,
        organizer_user_id=meeting.organizer_user_id,
        organizer_user=_serialize_user_ref(organizer_user),
        attendees=attendee_labels,
        attendee_user_ids=[user.id for user in attendee_users],
        attendee_users=[schemas.AdminMeetingUserRef(id=user.id, username=user.username, name=user.name) for user in attendee_users],
        source=meeting.source,
        created_by=meeting.created_by,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
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


async def _load_users_by_ids(db: AsyncSession, user_ids: list[int]) -> dict[int, models.User]:
    if not user_ids:
        return {}
    result = await db.execute(
        select(models.User).where(models.User.id.in_(user_ids))
    )
    return {user.id: user for user in result.scalars().all()}


async def _validate_payload(
    db: AsyncSession,
    payload: schemas.AdminMeetingCreate,
) -> tuple[str, models.User, str, list[models.User]]:
    subject = _normalize_string(payload.subject)
    meeting_room = _normalize_string(payload.meeting_room)
    attendee_user_ids = _normalize_user_ids(payload.attendee_user_ids)
    user_ids = _normalize_user_ids([payload.organizer_user_id, *attendee_user_ids])
    users_by_id = await _load_users_by_ids(db, user_ids)
    organizer_user = users_by_id.get(int(payload.organizer_user_id))
    attendee_users = [users_by_id[user_id] for user_id in attendee_user_ids if user_id in users_by_id]

    if not subject:
        raise HTTPException(status_code=400, detail="会议主题不能为空")
    if organizer_user is None:
        raise HTTPException(status_code=400, detail="会议发起人不能为空")
    if not meeting_room:
        raise HTTPException(status_code=400, detail="会议室不能为空")
    if payload.duration_minutes <= 0:
        raise HTTPException(status_code=400, detail="会议时长必须大于 0")
    if not attendee_users or len(attendee_users) != len(attendee_user_ids):
        raise HTTPException(status_code=400, detail="请至少填写一位参会人")

    return subject, organizer_user, meeting_room, attendee_users


def _meeting_load_options():
    return (
        selectinload(models.AdminMeeting.organizer_user),
        selectinload(models.AdminMeeting.attendee_links).selectinload(models.AdminMeetingAttendee.user),
    )


def _meeting_end_time_expression():
    return models.AdminMeeting.start_time + func.make_interval(mins=models.AdminMeeting.duration_minutes)


def _meeting_status_condition(status_value: schemas.AdminMeetingStatus | None):
    if status_value is None:
        return None

    now_expression = func.now()
    meeting_end_time = _meeting_end_time_expression()
    if status_value == "upcoming":
        return models.AdminMeeting.start_time > now_expression
    if status_value == "inProgress":
        return and_(
            models.AdminMeeting.start_time <= now_expression,
            meeting_end_time >= now_expression,
        )
    return meeting_end_time < now_expression


def _apply_meeting_filters(
    query: Select,
    *,
    q: str | None,
    meeting_type: schemas.MeetingType | None,
    start_from: datetime | None,
    start_to: datetime | None,
    organizer_user_id: int | None,
    attendee_user_id: int | None,
    status: schemas.AdminMeetingStatus | None,
) -> Select:
    normalized_query = _normalize_string(q or "")
    if normalized_query:
        search_term = f"%{normalized_query}%"
        query = query.where(
            or_(
                models.AdminMeeting.subject.ilike(search_term),
                models.AdminMeeting.meeting_room.ilike(search_term),
                models.AdminMeeting.meeting_id.ilike(search_term),
                models.AdminMeeting.organizer.ilike(search_term),
                cast(models.AdminMeeting.attendees, String).ilike(search_term),
            )
        )
    if meeting_type is not None:
        query = query.where(models.AdminMeeting.meeting_type == meeting_type)
    if start_from is not None:
        query = query.where(models.AdminMeeting.start_time >= start_from)
    if start_to is not None:
        query = query.where(models.AdminMeeting.start_time <= start_to)
    if organizer_user_id is not None and organizer_user_id > 0:
        query = query.where(models.AdminMeeting.organizer_user_id == organizer_user_id)
    if attendee_user_id is not None and attendee_user_id > 0:
        query = query.where(
            models.AdminMeeting.attendee_links.any(
                models.AdminMeetingAttendee.user_id == attendee_user_id
            )
        )
    status_condition = _meeting_status_condition(status)
    if status_condition is not None:
        query = query.where(status_condition)
    return query


async def _fetch_meeting_or_404(db: AsyncSession, meeting_pk: int) -> models.AdminMeeting:
    result = await db.execute(
        select(models.AdminMeeting)
        .options(*_meeting_load_options())
        .where(models.AdminMeeting.id == meeting_pk)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="会议不存在")
    return meeting


@router.get("/", response_model=schemas.AdminMeetingListResponse)
async def list_admin_meetings(
    request: Request,
    background_tasks: BackgroundTasks,
    q: str | None = Query(default=None),
    meeting_type: schemas.MeetingType | None = Query(default=None),
    start_from: datetime | None = Query(default=None),
    start_to: datetime | None = Query(default=None),
    organizer_user_id: int | None = Query(default=None),
    attendee_user_id: int | None = Query(default=None),
    status: schemas.AdminMeetingStatus | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("admin:access")),
):
    base_query: Select[tuple[models.AdminMeeting]] = (
        select(models.AdminMeeting)
        .options(*_meeting_load_options())
        .where(models.AdminMeeting.source == "local")
    )
    filtered_query = _apply_meeting_filters(
        base_query,
        q=q,
        meeting_type=meeting_type,
        start_from=start_from,
        start_to=start_to,
        organizer_user_id=organizer_user_id,
        attendee_user_id=attendee_user_id,
        status=status,
    )

    items_query = filtered_query.order_by(asc(models.AdminMeeting.start_time), asc(models.AdminMeeting.id)).offset(offset).limit(limit)
    result = await db.execute(items_query)
    items = result.scalars().all()

    summary_query = _apply_meeting_filters(
        select(
            func.count(models.AdminMeeting.id).label("total"),
            func.coalesce(func.sum(case((models.AdminMeeting.meeting_type == "online", 1), else_=0)), 0).label("online"),
            func.coalesce(func.sum(case((models.AdminMeeting.meeting_type == "offline", 1), else_=0)), 0).label("offline"),
            func.coalesce(func.sum(case((_meeting_status_condition("upcoming"), 1), else_=0)), 0).label("upcoming"),
        ).select_from(models.AdminMeeting).where(models.AdminMeeting.source == "local"),
        q=q,
        meeting_type=meeting_type,
        start_from=start_from,
        start_to=start_to,
        organizer_user_id=organizer_user_id,
        attendee_user_id=attendee_user_id,
        status=status,
    )
    summary_row = (await db.execute(summary_query)).mappings().one()
    total = int(summary_row["total"] or 0)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_READ_MEETINGS",
        target="meeting:list",
        detail=(
            f"q={q or '*'}, meeting_type={meeting_type or '*'}, status={status or '*'}, "
            f"organizer_user_id={organizer_user_id or '*'}, attendee_user_id={attendee_user_id or '*'}, "
            f"limit={limit}, offset={offset}, result_count={len(items)}, total={total}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )

    return schemas.AdminMeetingListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[_serialize_admin_meeting(item) for item in items],
        summary=schemas.AdminMeetingListSummary(
            total=total,
            upcoming=int(summary_row["upcoming"] or 0),
            online=int(summary_row["online"] or 0),
            offline=int(summary_row["offline"] or 0),
        ),
    )


@router.post("/", response_model=schemas.AdminMeeting, status_code=status.HTTP_201_CREATED)
async def create_admin_meeting(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.AdminMeetingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionChecker("admin:access")),
):
    subject, organizer_user, meeting_room, attendee_users = await _validate_payload(db, payload)

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
        organizer=_format_user_label(organizer_user),
        organizer_user_id=organizer_user.id,
        attendees=[_format_user_label(user) for user in attendee_users],
        attendee_links=[
            models.AdminMeetingAttendee(user_id=user.id)
            for user in attendee_users
        ],
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
            f"type={MEETING_TYPE_LABELS.get(meeting.meeting_type, meeting.meeting_type)}, attendees={len(attendee_users)}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return _serialize_admin_meeting(meeting)


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
    subject, organizer_user, meeting_room, attendee_users = await _validate_payload(db, payload)

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
    meeting.organizer = _format_user_label(organizer_user)
    meeting.organizer_user_id = organizer_user.id
    meeting.attendees = [_format_user_label(user) for user in attendee_users]
    meeting.attendee_links = [
        models.AdminMeetingAttendee(user_id=user.id)
        for user in attendee_users
    ]

    await db.commit()
    await db.refresh(meeting)
    meeting = await _fetch_meeting_or_404(db, meeting_pk)

    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id,
        username=current_user.username,
        action="ADMIN_UPDATE_MEETING",
        target=f"meeting:{meeting.id}",
        detail=(
            f"subject={meeting.subject}, meeting_id={meeting.meeting_id}, "
            f"type={MEETING_TYPE_LABELS.get(meeting.meeting_type, meeting.meeting_type)}, attendees={len(attendee_users)}"
        ),
        ip_address=request.client.host if request.client else "unknown",
        trace_id=request.headers.get("X-Request-ID"),
        domain="BUSINESS",
    )
    return _serialize_admin_meeting(meeting)


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
