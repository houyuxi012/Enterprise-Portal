from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import database, models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/news",
    tags=["news"]
)

@router.get("/", response_model=List[schemas.NewsItem])
async def read_news(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.NewsItem).offset(skip).limit(limit))
    news = result.scalars().all()
    return news

@router.post("/", response_model=schemas.NewsItem)
async def create_news(news: schemas.NewsItemCreate, db: AsyncSession = Depends(database.get_db)):
    db_news = models.NewsItem(**news.dict())
    db.add(db_news)
    await db.commit()
    await db.refresh(db_news)
    return db_news
