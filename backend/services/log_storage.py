
import asyncio
import psutil
import datetime
from sqlalchemy.future import select
from sqlalchemy import delete, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
import models
import logging

logger = logging.getLogger(__name__)

# 日志类型保留周期配置 (config_key, default_days, model_class)
LOG_RETENTION_CONFIG = {
    "system": ("log_retention_system_days", 7, models.SystemLog),
    "business": ("log_retention_business_days", 30, models.BusinessLog),
    "login": ("log_retention_login_days", 90, models.LoginAuditLog),
}

async def get_config_value(db: AsyncSession, key: str, default: str) -> str:
    result = await db.execute(select(models.SystemConfig).filter(models.SystemConfig.key == key))
    config = result.scalars().first()
    return config.value if config else default

async def cleanup_logs(db_session_factory):
    """
    Background task to clean up old logs based on per-type retention policy and disk usage.
    """
    logger.info("Starting log cleanup task...")
    
    async with db_session_factory() as db:
        try:
            # 1. Fetch disk usage config
            max_disk_usage_str = await get_config_value(db, "log_max_disk_usage", "80")
            try:
                max_disk_usage_percent = float(max_disk_usage_str)
            except ValueError:
                max_disk_usage_percent = 80.0

            # 2. Per-type cleanup based on retention policy
            for log_type, (config_key, default_days, model_class) in LOG_RETENTION_CONFIG.items():
                retention_days_str = await get_config_value(db, config_key, str(default_days))
                try:
                    retention_days = int(retention_days_str)
                except ValueError:
                    logger.error(f"Invalid retention config for {log_type}. Using default {default_days}.")
                    retention_days = default_days
                
                if retention_days > 0:
                    cutoff_date = datetime.datetime.now() - datetime.timedelta(days=retention_days)
                    cutoff_str = cutoff_date.isoformat()
                    
                    # LoginAuditLog uses 'login_time' instead of 'timestamp'
                    if model_class == models.LoginAuditLog:
                        await db.execute(delete(model_class).where(model_class.login_time < cutoff_str))
                    else:
                        await db.execute(delete(model_class).where(model_class.timestamp < cutoff_str))
                    
                    logger.info(f"Cleaned up {log_type} logs older than {retention_days} days.")
            
            await db.commit()

            # 3. Cleanup by Disk Usage (Emergency mode)
            disk_usage = psutil.disk_usage('/')
            current_usage_percent = disk_usage.percent

            if current_usage_percent > max_disk_usage_percent:
                logger.warning(f"Disk usage {current_usage_percent}% exceeds limit {max_disk_usage_percent}%. Triggering emergency cleanup.")
                
                # Emergency: Enforce 7-day retention for all log types
                emergency_retention = 7
                emergency_cutoff = datetime.datetime.now() - datetime.timedelta(days=emergency_retention)
                emergency_cutoff_str = emergency_cutoff.isoformat()
                
                for log_type, (_, _, model_class) in LOG_RETENTION_CONFIG.items():
                    if model_class == models.LoginAuditLog:
                        await db.execute(delete(model_class).where(model_class.login_time < emergency_cutoff_str))
                    else:
                        await db.execute(delete(model_class).where(model_class.timestamp < emergency_cutoff_str))
                
                await db.commit()
                logger.warning(f"Emergency cleanup completed: Enforced {emergency_retention} day retention for all log types.")

        except Exception as e:
            logger.error(f"Error during log cleanup: {e}")
            await db.rollback()

async def run_log_cleanup_scheduler(db_session_factory):
    while True:
        await cleanup_logs(db_session_factory)
        # Run every hour
        await asyncio.sleep(3600)

async def optimize_database(db_session_factory):
    """
    Performs database optimization:
    1. Creates missing indexes on timestamps (for existing DBs).
    2. Runs VACUUM to reclaim storage from deleted rows.
    3. Runs ANALYZE to update query statistics.
    """
    logger.info("Starting database optimization...")
    async with db_session_factory() as db:
        try:
            # 1. Ensure Indexes exist (Self-healing for existing deployments)
            # PostgreSQL specific syntax
            await db.execute(text("CREATE INDEX IF NOT EXISTS ix_system_logs_timestamp ON system_logs (timestamp)"))
            await db.execute(text("CREATE INDEX IF NOT EXISTS ix_business_logs_timestamp ON business_logs (timestamp)"))
            await db.execute(text("CREATE INDEX IF NOT EXISTS ix_login_audit_logs_login_time ON login_audit_logs (login_time)"))
            await db.commit()
            
            # 2. Run VACUUM & ANALYZE
            # VACUUM cannot run inside a transaction block, so we need isolation_level="AUTOCOMMIT"
            # But here we are in a session. We might need a raw connection or specific execution options.
            # SQLAlchemy async session usually wraps in transaction.
            # We'll try to execute it. If it fails due to transaction block, we might need a workaround.
            # Typically VACUUM must be outside transaction.
            pass
        except Exception as e:
            logger.error(f"Error during index creation: {e}")

    # For VACUUM, use a separate connection with autocommit
    # This part depends on the engine/driver access. 
    # Since we are using asyncpg, we can try via engine.
    try:
        # We need to access the engine from the session factory binding or pass it in
        engine = db_session_factory.kw['bind'] 
        async with engine.connect() as conn:
            # Set isolation level to AUTOCOMMIT for VACUUM
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.execute(text("VACUUM"))
            await conn.execute(text("ANALYZE"))
            logger.info("Database optimization (VACUUM, ANALYZE) completed.")
            return True
    except Exception as e:
        logger.error(f"Error during VACUUM: {e}")
        return False
