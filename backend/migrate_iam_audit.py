import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 获取数据库 URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/enterprise_portal")

async def migrate_iam_audit():
    """创建 iam_audit_logs 表"""
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        logger.info("Starting IAM Audit migration...")
        
        # 检查表是否存在
        result = await conn.execute(text("SELECT to_regclass('public.iam_audit_logs')"))
        exists = result.scalar()
        
        if True:  # Force recreate for dev/test to ensure schema matches (or use ALTER if prod)
            logger.info("Dropping existing iam_audit_logs table...")
            await conn.execute(text("DROP TABLE IF EXISTS iam_audit_logs CASCADE"))
            
            logger.info("Creating table iam_audit_logs...")
            await conn.execute(text("""
                CREATE TABLE iam_audit_logs (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ DEFAULT NOW(),
                    user_id INTEGER,
                    username VARCHAR(100),
                    action VARCHAR(100),
                    target_type VARCHAR(50),
                    target_id INTEGER,
                    target_name VARCHAR(100),
                    result VARCHAR(20) DEFAULT 'success',
                    reason VARCHAR(255),
                    detail JSONB,
                    ip_address VARCHAR(50),
                    user_agent TEXT,
                    trace_id VARCHAR(100)
                );
            """))
            
            logger.info("Creating indexes...")
            await conn.execute(text("CREATE INDEX ix_iam_audit_timestamp ON iam_audit_logs (timestamp)"))
            await conn.execute(text("CREATE INDEX ix_iam_audit_action_ts ON iam_audit_logs (action, timestamp)"))
            await conn.execute(text("CREATE INDEX ix_iam_audit_user_ts ON iam_audit_logs (user_id, timestamp)"))
            
            logger.info("✅ IAM Audit Logs table created successfully.")
        else:
            logger.info("⚠️ Table iam_audit_logs already exists. Skipping.")
            
            # 可选：检查列是否存在并增加（如果是增量更新）
            # 这里简单起见，假设如果存在则跳过，或者你可以选择 drop & recreate (慎用)
            pass

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate_iam_audit())
