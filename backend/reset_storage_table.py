
import asyncio
import logging
from database import engine
from models import Base
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def reset_storage_meta_table():
    async with engine.begin() as conn:
        logger.info("Dropping file_metadata table...")
        await conn.execute(text("DROP TABLE IF EXISTS file_metadata"))
        logger.info("Re-creating file_metadata table...")
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Table reset completed.")

if __name__ == "__main__":
    asyncio.run(reset_storage_meta_table())
