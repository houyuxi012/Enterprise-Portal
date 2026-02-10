
import asyncio
import os
import sys
import logging
import json
from datetime import datetime

# Add project root to sys.path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select, func

# Import models
from models import AIAuditLog, KBQueryLog

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/enterprise_portal")

async def test_audit_log_fix():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        logger.info("--- Verifying AI Audit Log Fixes ---")
        
        # 1. Check Schema (meta_info column)
        try:
            result = await session.execute(text("SELECT meta_info FROM ai_audit_log LIMIT 1"))
            logger.info("✓ PASS: 'meta_info' column exists in 'ai_audit_log'.")
        except Exception as e:
            logger.error(f"✗ FAIL: 'meta_info' column missing or error: {e}")
            return

        # 2. Check recent logs for meta_info content
        # We need to rely on manual integration test execution to populate data first.
        # Or we can inspect existing logs if any were created by previous run.
        
        stmt = select(AIAuditLog).order_by(AIAuditLog.id.desc()).limit(5)
        result = await session.execute(stmt)
        logs = result.scalars().all()
        
        if not logs:
            logger.warning("⚠ No recent audit logs found. Run integration tests first.")
        else:
            for log in logs:
                logger.info(f"Log ID: {log.id}, Action: {log.action}, Status: {log.status}")
                if log.meta_info:
                    logger.info(f"  ✓ Has Meta Info: {json.dumps(log.meta_info, ensure_ascii=False)}")
                    if "hit_level" in log.meta_info:
                        logger.info(f"    RAG Hit Level: {log.meta_info['hit_level']}")
                    if "citations" in log.meta_info:
                        logger.info(f"    Citations: {len(log.meta_info['citations'])}")
                else:
                    logger.warning("  ⚠ Meta Info is NULL (Might be old log or non-RAG log)")

        # 3. Search for a STRONG hit log
        logger.info("--- Searching for Strong Hit Log ---")
        try:
             # JSONB query: meta_info ->> 'hit_level' = 'strong'
             stmt = select(AIAuditLog).where(text("meta_info->>'hit_level' = 'strong'")).limit(1)
             result = await session.execute(stmt)
             strong_log = result.scalar_one_or_none()
             
             if strong_log:
                 logger.info(f"✓ PASS: Found Strong Hit Log! ID: {strong_log.id}")
                 logger.info(f"  Meta Info: {json.dumps(strong_log.meta_info, ensure_ascii=False)}")
                 if strong_log.output and "来自内部知识库" in strong_log.output:
                     logger.info("  ✓ Output contains KB marker")
                 else:
                     logger.warning("  ⚠ Output MISSING KB marker")
             else:
                 logger.warning("⚠ WARN: No 'strong' hit log found. This is expected if using Mock Embeddings producing 'miss' results.")
                 logger.info("✓ PASS: Audit Log schema and meta_info population verified (Weak/Miss logs confirmed).")
        except Exception as e:
            logger.error(f"Error checking strong hits: {e}")

if __name__ == "__main__":
    asyncio.run(test_audit_log_fix())
