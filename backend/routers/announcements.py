from fastapi import APIRouter, Depends, HTTPException, Request
from dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
from services.audit_service import AuditService
from routers.auth import get_current_user
import models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/announcements",
    tags=["announcements"]
)

@router.get("/", response_model=List[schemas.Announcement])
async def read_announcements(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Announcement))
    return result.scalars().all()

@router.post("/", response_model=schemas.Announcement, dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def create_announcement(
    request: Request,
    announcement: schemas.AnnouncementCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_announcement = models.Announcement(**announcement.dict())
    db.add(db_announcement)
    await db.commit()
    await db.refresh(db_announcement)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_ANNOUNCEMENT", 
        target=f"公告:{db_announcement.id} ({db_announcement.title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return db_announcement

@router.put("/{announcement_id}", response_model=schemas.Announcement, dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def update_announcement(
    request: Request,
    announcement_id: int, 
    announcement_update: schemas.AnnouncementCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.Announcement).filter(models.Announcement.id == announcement_id))
    announcement = result.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    for key, value in announcement_update.dict().items():
        setattr(announcement, key, value)
        
    await db.commit()
    await db.refresh(announcement)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_ANNOUNCEMENT", 
        target=f"公告:{announcement.id} ({announcement.title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return announcement

@router.delete("/{announcement_id}", dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def delete_announcement(
    request: Request,
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
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_ANNOUNCEMENT", 
        target=f"公告:{announcement_id} ({title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    return {"ok": True}
