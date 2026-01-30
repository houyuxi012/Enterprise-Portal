
import asyncio
from sqlalchemy import select
from database import SessionLocal
import models

async def main():
    async with SessionLocal() as session:
        result = await session.execute(select(models.NewsItem))
        news = result.scalars().all()
        print(f"News Count in DB: {len(news)}")
        for n in news:
            print(f"- {n.title} ({n.date})")

if __name__ == "__main__":
    asyncio.run(main())
