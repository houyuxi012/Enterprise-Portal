
import asyncio
import sys
from sqlalchemy import select, desc
from database import SessionLocal
from models import AIAuditLog
import datetime

async def check_latest_logs():
    async with SessionLocal() as session:
        stmt = select(AIAuditLog).order_by(desc(AIAuditLog.ts)).limit(10)
        result = await session.execute(stmt)
        logs = result.scalars().all()
        
        print(f"Found {len(logs)} logs in DB:")
        for log in logs:
            print(f"[{log.ts}] {log.event_id} | {log.source} | {log.action}")

if __name__ == "__main__":
    asyncio.run(check_latest_logs())
