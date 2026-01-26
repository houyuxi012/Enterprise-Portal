from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import database, models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/announcements",
    tags=["announcements"]
)

@router.get("/", response_model=List[schemas.Announcement])
async def read_announcements(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.Announcement).offset(skip).limit(limit))
    items = result.scalars().all()
    return items

@router.post("/", response_model=schemas.Announcement)
async def create_announcement(item: schemas.AnnouncementCreate, db: AsyncSession = Depends(database.get_db)):
    db_item = models.Announcement(**item.dict())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item
