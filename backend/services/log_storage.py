
import asyncio
import psutil
import datetime
from sqlalchemy.future import select
from sqlalchemy import delete, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
import models
import logging

logger = logging.getLogger(__name__)

async def get_config_value(db: AsyncSession, key: str, default: str) -> str:
    result = await db.execute(select(models.SystemConfig).filter(models.SystemConfig.key == key))
    config = result.scalars().first()
    return config.value if config else default

async def cleanup_logs(db_session_factory):
    """
    Background task to clean up old logs based on retention policy and disk usage.
    """
    logger.info("Starting log cleanup task...")
    
    async with db_session_factory() as db:
        try:
            # 1. Fetch Configuration
            retention_days_str = await get_config_value(db, "log_retention_days", "30") # Default 30 days
            max_disk_usage_str = await get_config_value(db, "log_max_disk_usage", "80") # Default 80%

            try:
                retention_days = int(retention_days_str)
                max_disk_usage_percent = float(max_disk_usage_str)
            except ValueError:
                logger.error("Invalid configuration for log retention. Using defaults.")
                retention_days = 30
                max_disk_usage_percent = 80.0

            # 2. Cleanup by Time (Retention Days)
            if retention_days > 0:
                cutoff_date = datetime.datetime.now() - datetime.timedelta(days=retention_days)
                cutoff_str = cutoff_date.isoformat() # Assuming ISO string timestamp
                
                # Delete System Logs
                await db.execute(delete(models.SystemLog).where(models.SystemLog.timestamp < cutoff_str))
                
                # Delete Business Logs
                await db.execute(delete(models.BusinessLog).where(models.BusinessLog.timestamp < cutoff_str))
                
                await db.commit()
                logger.info(f"Cleaned up logs older than {retention_days} days.")

            # 3. Cleanup by Disk Usage
            disk_usage = psutil.disk_usage('/')
            current_usage_percent = disk_usage.percent

            if current_usage_percent > max_disk_usage_percent:
                logger.warning(f"Disk usage {current_usage_percent}% exceeds limit {max_disk_usage_percent}%. Cleaning up oldest logs.")
                
                # Logic: Delete oldest logs day by day until usage is safe or safety limit reached
                # For simplicity in this iteration: Delete additional 1 day of logs per run if full
                # A more aggressive approach might be needed for rapid filling
                
                # Just trimming oldest 1000 logs as a safeguard for now to avoid freezing DB
                # or finding the oldest timestamp?
                 
                # Let's delete logs older than retention_days - 1 recursively? 
                # Be simple: If disk full, aggressively reduce retention policy temporarily for this run?
                # Practical Approach: Delete logs older than (Today - 1 Day) until space freed? NO that wipes everything.
                
                # Strategy: If disk full, delete oldest 10% of logs?
                # Simpler: Delete all logs created before Today if disk is effectively full?
                pass 
                # Implementation Note: Deleting specifically to free space is complex with SQL. 
                # We will stick to Time-based for MVP reliability, or maybe reduce retention by 1 day and loop?
                
                # BETTER STRATEGY MVP: If disk > limit, enforce a hard 7-day clamp, then 3-day.
                emergency_retention = 7
                if retention_days > emergency_retention:
                     cutoff_date = datetime.datetime.now() - datetime.timedelta(days=emergency_retention)
                     cutoff_str = cutoff_date.isoformat()
                     await db.execute(delete(models.SystemLog).where(models.SystemLog.timestamp < cutoff_str))
                     await db.execute(delete(models.BusinessLog).where(models.BusinessLog.timestamp < cutoff_str))
                     await db.commit()
                     logger.warning(f"Emergency cleanup triggered: Enforced {emergency_retention} day retention.")

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
