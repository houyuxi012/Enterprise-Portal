from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import database, models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/news",
    tags=["news"]
)

from routers.auth import get_current_active_admin
from fastapi import HTTPException, status

@router.get("/", response_model=List[schemas.NewsItem])
async def read_news(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.NewsItem).offset(skip).limit(limit))
    news = result.scalars().all()
    return news

@router.post("/", response_model=schemas.NewsItem)
async def create_news(
    news: schemas.NewsItemCreate, 
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_admin)
):
    db_news = models.NewsItem(**news.dict())
    db.add(db_news)
    await db.commit()
    await db.refresh(db_news)
    return db_news

@router.put("/{news_id}", response_model=schemas.NewsItem)
async def update_news(
    news_id: int,
    news: schemas.NewsItemUpdate,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_admin)
):
    result = await db.execute(select(models.NewsItem).where(models.NewsItem.id == news_id))
    db_news = result.scalars().first()
    if db_news is None:
        raise HTTPException(status_code=404, detail="News item not found")
    
    for key, value in news.dict().items():
        setattr(db_news, key, value)
        
    await db.commit()
    await db.refresh(db_news)
    return db_news

@router.delete("/{news_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_news(
    news_id: int,
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_active_admin)
):
    result = await db.execute(select(models.NewsItem).where(models.NewsItem.id == news_id))
    db_news = result.scalars().first()
    if db_news is None:
        raise HTTPException(status_code=404, detail="News item not found")
        
    await db.delete(db_news)
    await db.commit()
    return None
