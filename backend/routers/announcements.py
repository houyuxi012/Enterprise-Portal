from fastapi import APIRouter, Depends
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
