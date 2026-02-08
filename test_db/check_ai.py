import asyncio
import sys
import os

# Add parent directory to sys.path to allow importing from backend modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, Base, SessionLocal
from models import AIProvider, AIAuditLog
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        print("\n--- AI Providers in DB ---")
        result = await db.execute(select(AIProvider))
        providers = result.scalars().all()
        if not providers:
            print("No providers found.")
        for p in providers:
            print(f"[Provider] ID: {p.id}, Name: '{p.name}', Model: '{p.model}', Active: {p.is_active}")

        print("\n--- Unique Models in Audit Logs ---")
        result = await db.execute(select(AIAuditLog.model).distinct())
        models = result.scalars().all()
        if not models:
            print("No logs found.")
        for m in models:
            print(f"[Log Model] '{m}'")

if __name__ == "__main__":
    asyncio.run(main())
