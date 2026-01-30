from fastapi import APIRouter, Depends, HTTPException, status
from dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
from services.cache_manager import cache
import models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/news",
    tags=["news"]
)

@router.get("/", response_model=List[schemas.NewsItem])
async def read_news(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.NewsItem).order_by(models.NewsItem.is_top.desc(), models.NewsItem.date.desc()).offset(skip).limit(limit))
    news = result.scalars().all()
    return news

@router.post("/", response_model=schemas.NewsItem, status_code=status.HTTP_201_CREATED, dependencies=[Depends(PermissionChecker("content:news:edit"))])
async def create_news(news: schemas.NewsItemCreate, db: AsyncSession = Depends(get_db)):
    db_news = models.NewsItem(**news.dict())
    db.add(db_news)
    await db.commit()
    await db.refresh(db_news)
    await cache.delete("dashboard_stats")
    return db_news

@router.put("/{news_id}", response_model=schemas.NewsItem, dependencies=[Depends(PermissionChecker("content:news:edit"))])
async def update_news(news_id: int, news_update: schemas.NewsItemCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.NewsItem).filter(models.NewsItem.id == news_id))
    news = result.scalars().first()
    if news is None:
        raise HTTPException(status_code=404, detail="News item not found")
    
    for key, value in news_update.dict().items():
        setattr(news, key, value)
    
    await db.commit()
    await db.refresh(news)
    await cache.delete("dashboard_stats")
    return news

@router.delete("/{news_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(PermissionChecker("content:news:edit"))])
async def delete_news(news_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.NewsItem).filter(models.NewsItem.id == news_id))
    news = result.scalars().first()
    if news is None:
        raise HTTPException(status_code=404, detail="News item not found")
    
    await db.delete(news)
    await db.commit()
    await cache.delete("dashboard_stats")
    return None
