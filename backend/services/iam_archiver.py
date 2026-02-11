import logging
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from iam.audit.models import IAMAuditLog
import models
# from services.minio_service import MinioService # To be corrected
from database import SessionLocal
from services.audit_service import AuditService

logger = logging.getLogger(__name__)

class IAMAuditArchiver:
    """
    IAM 审计日志归档服务
    将过期日志导出到 MinIO 并从数据库清理
    """
    
    BUCKET_NAME = "archive-iam-logs"
    RETENTION_DAYS = 30 # 默认保留 30 天热数据
    DEFAULT_INTERVAL_SECONDS = 24 * 3600
    
    @staticmethod
    async def run_archiving_job():
        """定时任务入口（循环执行）"""
        interval_seconds = IAMAuditArchiver._get_interval_seconds()
        logger.info(f"Starting IAM Audit Archiving Scheduler, interval={interval_seconds}s")
        while True:
            try:
                await IAMAuditArchiver.run_archiving_once()
            except asyncio.CancelledError:
                logger.info("IAM Archiving Scheduler cancelled.")
                raise
            except Exception as e:
                logger.error(f"IAM Archiving Job failed: {e}", exc_info=True)
            await asyncio.sleep(interval_seconds)

    @staticmethod
    async def run_archiving_once():
        """执行一次归档任务"""
        async with SessionLocal() as db:
            await IAMAuditArchiver.archive_old_logs(db)

    @staticmethod
    def _get_interval_seconds() -> int:
        raw = os.getenv("IAM_ARCHIVE_INTERVAL_SECONDS")
        if not raw:
            return IAMAuditArchiver.DEFAULT_INTERVAL_SECONDS
        try:
            return max(300, int(raw))
        except ValueError:
            logger.warning(
                f"Invalid IAM_ARCHIVE_INTERVAL_SECONDS={raw}, "
                f"fallback={IAMAuditArchiver.DEFAULT_INTERVAL_SECONDS}"
            )
            return IAMAuditArchiver.DEFAULT_INTERVAL_SECONDS

    @staticmethod
    async def _get_retention_days(db: AsyncSession) -> int:
        """
        Read retention days from system config key: log_retention_iam_days.
        Fallback to class default.
        """
        try:
            stmt = select(models.SystemConfig).where(models.SystemConfig.key == "log_retention_iam_days")
            result = await db.execute(stmt)
            cfg = result.scalars().first()
            if cfg and cfg.value:
                return max(1, int(cfg.value))
        except Exception as e:
            logger.warning(f"Failed to read log_retention_iam_days, fallback default: {e}")
        return IAMAuditArchiver.RETENTION_DAYS

    @staticmethod
    async def archive_old_logs(db: AsyncSession):
        retention_days = await IAMAuditArchiver._get_retention_days(db)
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        logger.info(f"Archiving IAM logs older than {cutoff_date} (retention_days={retention_days})")
        archived_batches = 0
        archived_logs = 0
        last_error = None
        
        # 1. Fetch old logs (Limit batch size to avoid OOM)
        count_stmt = select(func.count()).where(IAMAuditLog.timestamp < cutoff_date)
        count_res = await db.execute(count_stmt)
        total_to_archive = count_res.scalar() or 0
        
        if total_to_archive == 0:
            logger.info("No logs to archive.")
            await AuditService.log_business_action(
                db=db,
                user_id=0,
                username="system_auto",
                action="AUTO_IAM_ARCHIVE",
                target="IAM审计归档",
                detail=json.dumps(
                    {
                        "retention_days": retention_days,
                        "cutoff_date": cutoff_date.isoformat(),
                        "total_to_archive": 0,
                        "archived_logs": 0,
                        "archived_batches": 0,
                    },
                    ensure_ascii=False,
                ),
                ip_address="127.0.0.1",
                domain="SYSTEM",
            )
            await db.commit()
            return

        logger.info(f"Found {total_to_archive} logs to archive.")
        
        # 2. Export to JSON
        limit = 1000
        
        while True:
            stmt = select(IAMAuditLog).where(IAMAuditLog.timestamp < cutoff_date).limit(limit)
            result = await db.execute(stmt)
            logs = result.scalars().all()
            
            if not logs:
                break
                
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"iam_audit_{timestamp_str}_batch.jsonl"
            content = ""
            
            log_ids = []
            for log in logs:
                log_ids.append(log.id)
                log_dict = {
                    "id": log.id,
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                    "action": log.action,
                    "username": log.username,
                    "user_id": log.user_id,
                    "target_type": log.target_type,
                    "target_id": log.target_id,
                    "result": log.result,
                    "detail": log.detail,
                    "ip_address": log.ip_address,
                    "trace_id": log.trace_id
                }
                content += json.dumps(log_dict, ensure_ascii=False) + "\n"
                
            # 3. Upload to MinIO
            if content:
                file_size = len(content.encode('utf-8'))
                
                try:
                    # Dynamically import to avoid circular or missing errors if file name differs
                    # We will fix this import once we know the filename
                    from minio import Minio
                    import io
                    
                    # Manual MinIO client setup if service not found, OR use existing one
                    # Assuming we can grab params from env
                    minio_endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
                    minio_access = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
                    minio_secret = os.getenv("MINIO_SECRET_KEY", "minioadmin@houyuxi")
                    minio_secure = False
                    
                    client = Minio(
                        minio_endpoint,
                        access_key=minio_access,
                        secret_key=minio_secret,
                        secure=minio_secure
                    )
                    
                    if not client.bucket_exists(IAMAuditArchiver.BUCKET_NAME):
                        client.make_bucket(IAMAuditArchiver.BUCKET_NAME)
                        
                    data_stream = io.BytesIO(content.encode('utf-8'))
                    
                    client.put_object(
                        IAMAuditArchiver.BUCKET_NAME,
                        filename,
                        data_stream,
                        file_size,
                        content_type="application/x-ndjson"
                    )
                    logger.info(f"Uploaded {filename} to MinIO.")
                    
                    # 4. Delete from DB
                    del_stmt = delete(IAMAuditLog).where(IAMAuditLog.id.in_(log_ids))
                    await db.execute(del_stmt)
                    await db.commit()
                    archived_batches += 1
                    archived_logs += len(log_ids)
                    logger.info(f"Deleted {len(log_ids)} archived logs from DB.")
                    
                except Exception as e:
                    last_error = str(e)
                    logger.error(f"Failed to upload/delete batch: {e}")
                    await db.rollback()
                    break

            if len(logs) < limit:
                break
                
        logger.info("Archiving complete.")
        await AuditService.log_business_action(
            db=db,
            user_id=0,
            username="system_auto",
            action="AUTO_IAM_ARCHIVE",
            target="IAM审计归档",
            status="FAIL" if last_error else "SUCCESS",
            detail=json.dumps(
                {
                    "retention_days": retention_days,
                    "cutoff_date": cutoff_date.isoformat(),
                    "total_to_archive": total_to_archive,
                    "archived_logs": archived_logs,
                    "archived_batches": archived_batches,
                    "error": last_error,
                },
                ensure_ascii=False,
            ),
            ip_address="127.0.0.1",
            domain="SYSTEM",
        )
        await db.commit()
