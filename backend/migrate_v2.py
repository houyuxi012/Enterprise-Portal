
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.sql import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def run_sql(sql, params=None):
    engine = create_async_engine(DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        try:
            await conn.execute(text(sql), params)
        except Exception as e:
            print(f"Update failed (might exist): {e}")
    await engine.dispose()

async def migrate():
    # 1. Add name column
    print("Migrating: Adding name column...")
    await run_sql("ALTER TABLE users ADD COLUMN name VARCHAR")
    
    # 2. Add avatar column
    print("Migrating: Adding avatar column...")
    await run_sql("ALTER TABLE users ADD COLUMN avatar VARCHAR")

    # 3. Update Admin info
    print("Updating Admin info...")
    await run_sql("UPDATE users SET name = '管理员', avatar = '' WHERE username = 'admin'")
    
    print("Migration Complete.")

if __name__ == "__main__":
    asyncio.run(migrate())
