from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from core.dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from core.database import get_db
from application.portal_app import AuditService, cache
from modules.iam.routers.auth import get_current_user
import modules.models as models
import modules.schemas as schemas
from sqlalchemy import func, select

router = APIRouter(
    prefix="/news",
    tags=["news"]
)

MAX_NEWS_CENTER_CAROUSEL_ITEMS = 4


def _resolve_news_author(raw_author: str | None, current_user: models.User) -> str:
    author = str(raw_author or "").strip()
    if author:
        return author
    return str(current_user.name or current_user.username or "system").strip()


def _apply_news_promotion_flags(payload: dict) -> dict:
    promotion_keys = (
        "show_in_news_feed",
        "show_in_news_center_carousel",
        "show_in_news_center_latest",
    )
    legacy_is_top = bool(payload.get("is_top"))
    if legacy_is_top and not any(bool(payload.get(key)) for key in promotion_keys):
        for key in promotion_keys:
            payload[key] = True
    return payload


async def _enforce_news_center_carousel_limit(
    db: AsyncSession,
    payload: dict,
    *,
    exclude_news_id: int | None = None,
) -> None:
    if not bool(payload.get("show_in_news_center_carousel")):
        return

    stmt = select(func.count(models.NewsItem.id)).where(models.NewsItem.show_in_news_center_carousel.is_(True))
    if exclude_news_id is not None:
        stmt = stmt.where(models.NewsItem.id != exclude_news_id)

    current_count = int((await db.execute(stmt)).scalar_one() or 0)
    if current_count >= MAX_NEWS_CENTER_CAROUSEL_ITEMS:
        raise HTTPException(
            status_code=400,
            detail=f"资讯中心轮播最多只能勾选 {MAX_NEWS_CENTER_CAROUSEL_ITEMS} 条新闻。",
        )

@router.get("/", response_model=List[schemas.NewsItem])
async def read_news(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.NewsItem)
        .order_by(
            models.NewsItem.show_in_news_center_latest.desc(),
            models.NewsItem.show_in_news_feed.desc(),
            models.NewsItem.show_in_news_center_carousel.desc(),
            models.NewsItem.date.desc(),
            models.NewsItem.id.desc(),
        )
        .offset(skip)
        .limit(limit)
    )
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
    payload = news.model_dump()
    payload["author"] = _resolve_news_author(news.author, current_user)
    payload = _apply_news_promotion_flags(payload)
    await _enforce_news_center_carousel_limit(db, payload)
    db_news = models.NewsItem(**payload)
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

    payload = news_update.model_dump()
    payload["author"] = _resolve_news_author(news_update.author, current_user) if news_update.author else news.author
    payload = _apply_news_promotion_flags(payload)
    await _enforce_news_center_carousel_limit(db, payload, exclude_news_id=news_id)
    for key, value in payload.items():
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
