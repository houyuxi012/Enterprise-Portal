from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timedelta
import database
import models
import schemas
from routers.auth import get_current_user

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
)

@router.get("/stats", response_model=schemas.DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Try Cache First
    from services.cache_manager import cache
    cache_key = "dashboard_stats"
    cached_data = await cache.get(cache_key)
    if cached_data:
        return cached_data

    # 1. System Visits (Total SystemLogs)
    # Filter out polling endpoints to get "real" user activity logs if needed, 
    # but since we filter them at middleware level now, we can just count.
    
    # Current Stats
    total_visits_query = select(func.count(models.SystemLog.id))
    result = await db.execute(total_visits_query)
    system_visits = result.scalar() or 0

    # 4. New Content (News in last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    # Ensure strict date comparison if db column is Date
    result = await db.execute(select(func.count(models.NewsItem.id)).where(models.NewsItem.date >= seven_days_ago.date()))
    new_content = result.scalar() or 0

    # --- Trend Calculation (Week over Week) ---
    now = datetime.utcnow()
    start_of_current_week = now - timedelta(days=7)
    start_of_previous_week = start_of_current_week - timedelta(days=7)

    async def get_count_in_range(model, start, end):
        query = select(func.count(model.id)).where(
            model.timestamp >= start.isoformat() if hasattr(model, 'timestamp') else model.created_at >= start
        ).where(
            model.timestamp < end.isoformat() if hasattr(model, 'timestamp') else model.created_at < end
        )
        res = await db.execute(query)
        return res.scalar() or 0

    # System Visits Trend
    current_week_visits = await get_count_in_range(models.SystemLog, start_of_current_week, now)
    previous_week_visits = await get_count_in_range(models.SystemLog, start_of_previous_week, start_of_current_week)
    
    visit_trend = "0%"
    if previous_week_visits > 0:
        change = ((current_week_visits - previous_week_visits) / previous_week_visits) * 100
        visit_trend = f"{'+' if change > 0 else ''}{change:.1f}%"
    elif current_week_visits > 0:
        visit_trend = "+100%"

    # 2. Active Users (Simulated for MVP, using login count from logs could be better but let's stick to total users for now)
    result = await db.execute(select(func.count(models.User.id)).where(models.User.is_active == True))
    active_users = result.scalar() or 0
    
    # 3. Tool Clicks / App Visits
    # Support both legacy "tool_click" and new "APP_LAUNCH" actions
    result = await db.execute(select(func.count(models.BusinessLog.id)).where(models.BusinessLog.action.in_(["tool_click", "APP_LAUNCH"])))
    tool_clicks = result.scalar() or 0

    # Peak Time / Daily Activity (Current Week: Sun - Sat)
    # Find start of current week (Sunday)
    # Python weekday(): Mon=0, Sun=6.
    today = datetime.utcnow().date()
    # Calculate days to subtract to get to last Sunday
    idx = (today.weekday() + 1) % 7 # Sun=0, Mon=1...
    start_of_week = datetime.combine(today - timedelta(days=idx), datetime.min.time())
    
    peak_data = []
    for i in range(7):
        day_start = start_of_week + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        # Query
        count = await get_count_in_range(models.SystemLog, day_start, day_end)
        peak_data.append(count)

    stats_data = schemas.DashboardStats(
        system_visits=system_visits,
        active_users=active_users,
        tool_clicks=tool_clicks,
        new_content=new_content,
        activity_trend=visit_trend, 
        active_users_trend="+0.0%", # Placeholder
        tool_clicks_trend="+0.0%",  # Placeholder
        new_content_trend="+0.0%",   # Placeholder
        peak_time_data=peak_data
    )
    
    # Cache result for 60 seconds
    await cache.set(cache_key, stats_data.dict(), ttl=60)
    
    return stats_data
