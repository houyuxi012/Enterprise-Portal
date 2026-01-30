import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/portal_db")

async def migrate():
    print(f"Connecting to {DATABASE_URL}...")
    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        print("Adding security columns to users table...")
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;"))
            print("Added failed_attempts column.")
        except Exception as e:
            print(f"failed_attempts column might already exist: {e}")

        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;"))
            print("Added locked_until column.")
        except Exception as e:
            print(f"locked_until column might already exist: {e}")

    await engine.dispose()
    print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate())
