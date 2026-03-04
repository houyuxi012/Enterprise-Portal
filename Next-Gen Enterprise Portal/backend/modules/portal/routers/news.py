from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from core.dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from core.database import get_db
from infrastructure.cache_manager import cache
from modules.iam.services.audit_service import AuditService
from modules.iam.routers.auth import get_current_user
import modules.models as models
import modules.schemas as schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/news",
    tags=["news"]
)

@router.get("/", response_model=List[schemas.NewsItem])
async def read_news(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    result = await db.execute(select(models.NewsItem).order_by(models.NewsItem.is_top.desc(), models.NewsItem.date.desc()).offset(skip).limit(limit))
    news = result.scalars().all()
    return news

@router.post("/", response_model=schemas.NewsItem, status_code=status.HTTP_201_CREATED, dependencies=[Depends(PermissionChecker("content:news:edit"))])
async def create_news(
    request: Request,
    background_tasks: BackgroundTasks,
    news: schemas.NewsItemCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_news = models.NewsItem(**news.dict())
    db.add(db_news)
    await db.commit()
    await db.refresh(db_news)
    await cache.delete("dashboard_stats")
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_NEWS", 
        target=f"新闻:{db_news.id} ({db_news.title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    
    return db_news

@router.put("/{news_id}", response_model=schemas.NewsItem, dependencies=[Depends(PermissionChecker("content:news:edit"))])
async def update_news(
    request: Request,
    background_tasks: BackgroundTasks,
    news_id: int, 
    news_update: schemas.NewsItemCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.NewsItem).filter(models.NewsItem.id == news_id))
    news = result.scalars().first()
    if news is None:
        raise HTTPException(status_code=404, detail="News item not found")
    
    for key, value in news_update.dict().items():
        setattr(news, key, value)
    
    await db.commit()
    await db.refresh(news)
    await cache.delete("dashboard_stats")
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_NEWS", 
        target=f"新闻:{news.id} ({news.title})", 
        ip_address=ip,
        trace_id=trace_id
    )

    return news

@router.delete("/{news_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(PermissionChecker("content:news:edit"))])
async def delete_news(
    request: Request,
    background_tasks: BackgroundTasks,
    news_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.NewsItem).filter(models.NewsItem.id == news_id))
    news = result.scalars().first()
    if news is None:
        raise HTTPException(status_code=404, detail="News item not found")
    
    title = news.title # Capture title before deletion
    await db.delete(news)
    await db.commit()
    await cache.delete("dashboard_stats")
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    AuditService.schedule_business_action(
        background_tasks=background_tasks,
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_NEWS", 
        target=f"新闻:{news_id} ({title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    
    return None
