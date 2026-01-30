
import asyncio
import logging
from database import engine
from models import Base
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def create_audit_logs_table():
    async with engine.begin() as conn:
        logger.info("Creating login_audit_logs table if not exists...")
        # Create table using metadata
        # Since we added LoginAuditLog to models.py and imported it, 
        # create_all will create it if not exists.
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Audit logs table creation completed.")

if __name__ == "__main__":
    asyncio.run(create_audit_logs_table())
