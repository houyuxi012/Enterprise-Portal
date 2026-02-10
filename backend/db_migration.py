
import asyncio
import os
import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/enterprise_portal")

async def migrate_db():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        print("Migrating Database...")
        try:
            # Check if column exists
            # Simply try to add it, if it fails, it might exist (though we know it doesn't)
            await conn.execute(text("ALTER TABLE ai_audit_log ADD COLUMN IF NOT EXISTS meta_info JSONB;"))
            print("Successfully added 'meta_info' column.")
        except Exception as e:
            print(f"Migration failed or column exists: {e}")

if __name__ == "__main__":
    asyncio.run(migrate_db())
