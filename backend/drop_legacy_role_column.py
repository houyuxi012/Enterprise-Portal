import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/enterprise_portal")

async def drop_user_role_column():
    """Drop the deprecated 'role' column from users table."""
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        logger.info("Starting cleanup of deprecated 'role' column...")
        
        # Check if column exists
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='role'"
        ))
        exists = result.scalar()
        
        if exists:
            logger.info("Column 'role' exists. Dropping it now.")
            # Drop column
            await conn.execute(text("ALTER TABLE users DROP COLUMN role"))
            logger.info("✅ Column 'role' dropped successfully.")
        else:
            logger.info("⚠️ Column 'role' does not exist. Skipping.")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(drop_user_role_column())
