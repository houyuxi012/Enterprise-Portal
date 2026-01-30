
import asyncio
import logging
from database import engine
from models import Base
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def create_storage_meta_table():
    async with engine.begin() as conn:
        logger.info("Creating file_metadata table if not exists...")
        await conn.run_sync(Base.metadata.create_all)
        logger.info("File metadata table creation completed.")

if __name__ == "__main__":
    asyncio.run(create_storage_meta_table())
