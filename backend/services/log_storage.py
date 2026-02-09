
import asyncio
import psutil
import datetime
from sqlalchemy.future import select
from sqlalchemy import delete, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
import models
from iam.audit.models import IAMAuditLog
import logging

logger = logging.getLogger(__name__)

# 日志类型保留周期配置 (config_key, default_days, model_class, timestamp_field, field_type)
# field_type: 'str' = Column is String, 'dt' = Column is DateTime
LOG_RETENTION_CONFIG = {
    "system": ("log_retention_system_days", 7, models.SystemLog, "timestamp", "str"),
    "business": ("log_retention_business_days", 30, models.BusinessLog, "timestamp", "str"),
    "login": ("log_retention_login_days", 90, models.LoginAuditLog, "created_at", "str"),
    "ai": ("log_retention_ai_days", 30, models.AIAuditLog, "ts", "dt"),
    "iam": ("log_retention_iam_days", 90, IAMAuditLog, "timestamp", "dt"),
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
            for log_type, (config_key, default_days, model_class, ts_field, field_type) in LOG_RETENTION_CONFIG.items():
                retention_days_str = await get_config_value(db, config_key, str(default_days))
                try:
                    retention_days = int(retention_days_str)
                except ValueError:
                    logger.error(f"Invalid retention config for {log_type}. Using default {default_days}.")
                    retention_days = default_days
                
                if retention_days > 0:
                    cutoff_date = datetime.datetime.now() - datetime.timedelta(days=retention_days)
                    
                    # Use the correct timestamp field for each model
                    ts_column = getattr(model_class, ts_field)
                    
                    # Handle different column types: String vs DateTime
                    if field_type == "str":
                        # String columns need isoformat comparison
                        cutoff_str = cutoff_date.isoformat()
                        await db.execute(delete(model_class).where(ts_column < cutoff_str))
                    else:
                        # DateTime columns use datetime object directly
                        await db.execute(delete(model_class).where(ts_column < cutoff_date))
                    
                    logger.info(f"Cleaned up {log_type} logs older than {retention_days} days.")
            
            await db.commit()

            # 3. Cleanup by Disk Usage - Delete oldest logs until within limit
            disk_usage = psutil.disk_usage('/')
            current_usage_percent = disk_usage.percent

            if current_usage_percent > max_disk_usage_percent:
                logger.warning(f"Disk usage {current_usage_percent}% exceeds limit {max_disk_usage_percent}%. Starting iterative cleanup...")
                
                # Define batch size for deletion
                batch_size = 1000
                max_iterations = 50  # Safety limit to prevent infinite loop
                iteration = 0
                
                while current_usage_percent > max_disk_usage_percent and iteration < max_iterations:
                    iteration += 1
                    deleted_any = False
                    
                    # Find and delete oldest logs from each type
                    for log_type, (_, _, model_class, ts_field, _) in LOG_RETENTION_CONFIG.items():
                        try:
                            # Find oldest records using the correct timestamp field
                            ts_column = getattr(model_class, ts_field)
                            oldest_query = select(model_class.id).order_by(ts_column).limit(batch_size)
                            
                            result = await db.execute(oldest_query)
                            oldest_ids = [row[0] for row in result.fetchall()]
                            
                            if oldest_ids:
                                await db.execute(delete(model_class).where(model_class.id.in_(oldest_ids)))
                                deleted_any = True
                                logger.info(f"Deleted {len(oldest_ids)} oldest {log_type} logs (iteration {iteration})")
                        except Exception as e:
                            logger.error(f"Error deleting {log_type} logs: {e}")
                    
                    await db.commit()
                    
                    # Re-check disk usage after deletion
                    disk_usage = psutil.disk_usage('/')
                    current_usage_percent = disk_usage.percent
                    
                    if not deleted_any:
                        logger.warning("No more logs to delete, but disk usage still exceeds limit.")
                        break
                    
                    logger.info(f"After iteration {iteration}: disk usage now {current_usage_percent}%")
                
                if current_usage_percent <= max_disk_usage_percent:
                    logger.info(f"Disk cleanup completed. Usage now {current_usage_percent}% (limit: {max_disk_usage_percent}%)")
                else:
                    logger.warning(f"Cleanup stopped after {iteration} iterations. Disk usage still {current_usage_percent}%")

        except Exception as e:
            logger.error(f"Error during log cleanup: {e}")
            await db.rollback()

async def run_log_cleanup_scheduler(db_session_factory):
    while True:
        await cleanup_logs(db_session_factory)
        # Run every hour
        await asyncio.sleep(3600)

async def optimize_database(db_session_factory, engine=None):
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
            await db.execute(text("CREATE INDEX IF NOT EXISTS ix_login_audit_logs_created_at ON login_audit_logs (created_at)"))
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
            await db.rollback()

    # For VACUUM, use a separate connection with autocommit
    # This part depends on the engine/driver access. 
    # Since we are using asyncpg, we can try via engine.
    try:
        # We need to access the engine from the session factory binding or pass it in
        if engine is None:
            engine = getattr(db_session_factory, "kw", {}).get("bind")
        if engine is None:
            logger.error("No database engine available for VACUUM")
            return False
        async with engine.connect() as conn:
            # Set isolation level to AUTOCOMMIT for VACUUM
            conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.execute(text("VACUUM"))
            await conn.execute(text("ANALYZE"))
            logger.info("Database optimization (VACUUM, ANALYZE) completed.")
            return True
    except Exception as e:
        logger.error(f"Error during VACUUM: {e}")
        return False
