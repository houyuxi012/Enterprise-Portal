from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import asyncio
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@db:5432/portal_db")

async def run_migration():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        try:
            print("Checking sort_order column...")
            # We can't select from information_schema easily in async with begin() wrapper sometimes, 
            # but let's try raw execute.
            # Actually, simpler way: try to select sort_order from tools. If fails, add it.
            # Or just "ALTER TABLE tools ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;"
            # Postgres supports IF NOT EXISTS for column in recent versions (>=9.6? no, 9.6 yes).
            # Let's hope version 17 supports it. Yes it does.
            await conn.execute(text("ALTER TABLE tools ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;"))
            print("Migration command executed.")
        except Exception as e:
            print(f"Migration error: {e}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_migration())
