import asyncio
from sqlalchemy import select, func
from datetime import datetime, timedelta
import models
import database
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Setup async DB connection for script
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///./sql_app.db"
engine = create_async_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def check_data():
    async with AsyncSessionLocal() as db:
        # Check Total News
        result = await db.execute(select(func.count(models.NewsItem.id)))
        total = result.scalar()
        print(f"Total News: {total}")

        # Check News content for dates
        result = await db.execute(select(models.NewsItem))
        news = result.scalars().all()
        for n in news:
            print(f"News ID: {n.id}, Date: {n.date} (Type: {type(n.date)})")

        # Check Query Logic
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        print(f"Seven days ago (datetime): {seven_days_ago}")
        
        # Try Query
        try:
            # We need to cast seven_days_ago to date if column is Date
            seven_days_ago_date = seven_days_ago.date()
            print(f"Seven days ago (date): {seven_days_ago_date}")
            
            q = select(func.count(models.NewsItem.id)).where(models.NewsItem.date >= seven_days_ago_date)
            res = await db.execute(q)
            count = res.scalar()
            print(f"Count (Date comparison): {count}")
        except Exception as e:
            print(f"Query failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_data())
