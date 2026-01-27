from fastapi import APIRouter, Depends, HTTPException
from dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
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
async def create_announcement(announcement: schemas.AnnouncementCreate, db: AsyncSession = Depends(get_db)):
    db_announcement = models.Announcement(**announcement.dict())
    db.add(db_announcement)
    await db.commit()
    await db.refresh(db_announcement)
    return db_announcement

@router.put("/{announcement_id}", response_model=schemas.Announcement, dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def update_announcement(announcement_id: int, announcement_update: schemas.AnnouncementCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Announcement).filter(models.Announcement.id == announcement_id))
    announcement = result.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    for key, value in announcement_update.dict().items():
        setattr(announcement, key, value)
        
    await db.commit()
    await db.refresh(announcement)
    return announcement

@router.delete("/{announcement_id}", dependencies=[Depends(PermissionChecker("content:announcement:edit"))])
async def delete_announcement(announcement_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Announcement).filter(models.Announcement.id == announcement_id))
    announcement = result.scalars().first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
        
    await db.delete(announcement)
    await db.commit()
    return {"ok": True}
