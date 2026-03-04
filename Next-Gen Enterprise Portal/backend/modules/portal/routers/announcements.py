import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from core.dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from core.database import get_db
from modules.iam.services.audit_service import AuditService
from modules.iam.routers.auth import get_current_user
import modules.models as models
import modules.schemas as schemas
from sqlalchemy import select, desc

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/announcements",
    tags=["announcements"]
)

@router.get("/", response_model=List[schemas.Announcement])
async def read_announcements(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.Announcement).order_by(
            desc(models.Announcement.created_at),
            desc(models.Announcement.id),
        )
    )
    announcements = result.scalars().all()
    try:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="READ_ANNOUNCEMENTS",
            target="公告列表",
            detail=f"count={len(announcements)}",
            ip_address=request.client.host if request.client else "unknown",
            trace_id=request.headers.get("X-Request-ID"),
            domain="CONTENT",
        )
    except Exception as e:
        logger.warning("Failed to write announcement read audit: %s", e)
    return announcements


@router.get("/read-state", response_model=schemas.AnnouncementReadStateResponse)
async def read_announcement_state(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.AnnouncementRead.announcement_id).filter(
            models.AnnouncementRead.user_id == current_user.id
        )
    )
    return {"announcement_ids": sorted(set(result.scalars().all()))}


@router.post("/read-state", response_model=schemas.AnnouncementReadStateResponse)
async def upsert_announcement_state(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: schemas.AnnouncementReadStateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ids = sorted({int(i) for i in (payload.announcement_ids or []) if int(i) > 0})
    if not ids:
        return {"announcement_ids": []}

    existing_announcement_ids = set(
        (
            await db.execute(
                select(models.Announcement.id).filter(models.Announcement.id.in_(ids))
            )
        )
        .scalars()
        .all()
    )
    if not existing_announcement_ids:
        return {"announcement_ids": []}

    existing_read_ids = set(
        (
            await db.execute(
                select(models.AnnouncementRead.announcement_id).filter(
                    models.AnnouncementRead.user_id == current_user.id,
                    models.AnnouncementRead.announcement_id.in_(existing_announcement_ids),
                )
            )
        )
        .scalars()
        .all()
    )

    newly_marked_ids = sorted(existing_announcement_ids - existing_read_ids)
    for announcement_id in newly_marked_ids:
        db.add(
            models.AnnouncementRead(
                user_id=current_user.id,
                announcement_id=announcement_id,
            )
        )

    await db.commit()
    try:
        AuditService.schedule_business_action(
            background_tasks=background_tasks,
            user_id=current_user.id,
            username=current_user.username,
            action="MARK_ANNOUNCEMENTS_READ",
            target="公告已读",
            detail=(
                f"requested_ids={ids}, "
                f"matched_ids={sorted(existing_announcement_ids)}, "
                f"newly_marked_ids={newly_marked_ids}, "
                f"changed_count={len(newly_marked_ids)}"
            ),
            ip_address=request.client.host if request.client else "unknown",
            trace_id=request.headers.get("X-Request-ID"),
            domain="BUSINESS",
        )
    except Exception as e:
        logger.warning("Failed to write announcement read-state audit: %s", e)
    return {"announcement_ids": sorted(existing_announcement_ids | existing_read_ids)}

@router.post("/", response_model=schemas.Announcement, dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def create_announcement(
    request: Request,
    background_tasks: BackgroundTasks,
    announcement: schemas.AnnouncementCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Do not trust client-supplied display time. Lifecycle/audit timeline uses server created_at.
    db_announcement = models.Announcement(
        tag=announcement.tag,
        title=announcement.title,
        content=announcement.content,
        color=announcement.color,
        is_urgent=announcement.is_urgent,
    )
    db.add(db_announcement)
    await db.commit()
    await db.refresh(db_announcement)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_ANNOUNCEMENT", 
        target=f"公告:{db_announcement.id} ({db_announcement.title})", 
        ip_address=ip,
        trace_id=trace_id
    )

    return db_announcement

@router.put("/{announcement_id}", response_model=schemas.Announcement, dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def update_announcement(
    request: Request,
    background_tasks: BackgroundTasks,
    announcement_id: int, 
    announcement_update: schemas.AnnouncementCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.Announcement).filter(models.Announcement.id == announcement_id))
    announcement = result.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    # Keep created_at immutable and ignore legacy time mutation from clients.
    announcement.tag = announcement_update.tag
    announcement.title = announcement_update.title
    announcement.content = announcement_update.content
    announcement.color = announcement_update.color
    announcement.is_urgent = announcement_update.is_urgent
        
    await db.commit()
    await db.refresh(announcement)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_ANNOUNCEMENT", 
        target=f"公告:{announcement.id} ({announcement.title})", 
        ip_address=ip,
        trace_id=trace_id
    )

    return announcement

@router.delete("/{announcement_id}", dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def delete_announcement(
    request: Request,
    background_tasks: BackgroundTasks,
    announcement_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.Announcement).filter(models.Announcement.id == announcement_id))
    announcement = result.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    title = announcement.title
    await db.delete(announcement)
    await db.commit()
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_ANNOUNCEMENT", 
        target=f"公告:{announcement_id} ({title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    
    return {"ok": True}
