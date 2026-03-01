
import asyncio
from sqlalchemy import select, delete, func
from database import SessionLocal
from models import AIAuditLog
import datetime

async def cleanup_future_logs():
    async with SessionLocal() as session:
        # Get current time in UTC
        now = datetime.datetime.now(datetime.timezone.utc)
        print(f"Current Time (UTC): {now}")
        
        # Count logs in the future
        stmt = select(func.count(AIAuditLog.id)).filter(AIAuditLog.ts > now)
        result = await session.execute(stmt)
        count = result.scalar()
        
        print(f"Found {count} logs with timestamps in the future.")
        
        if count > 0:
            print("Deleting future logs...")
            del_stmt = delete(AIAuditLog).filter(AIAuditLog.ts > now)
            await session.execute(del_stmt)
            await session.commit()
            print("Future logs deleted.")
        else:
            print("No future logs found.")

if __name__ == "__main__":
    asyncio.run(cleanup_future_logs())
