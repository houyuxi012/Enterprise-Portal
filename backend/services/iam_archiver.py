import logging
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from iam.audit.models import IAMAuditLog
# from services.minio_service import MinioService # To be corrected
from database import SessionLocal

logger = logging.getLogger(__name__)

class IAMAuditArchiver:
    """
    IAM 审计日志归档服务
    将过期日志导出到 MinIO 并从数据库清理
    """
    
    BUCKET_NAME = "archive-iam-logs"
    RETENTION_DAYS = 30 # 保留 30 天热数据
    
    @staticmethod
    async def run_archiving_job():
        """定时任务入口"""
        logger.info("Starting IAM Audit Archiving Job...")
        try:
            async with SessionLocal() as db:
                await IAMAuditArchiver.archive_old_logs(db)
        except Exception as e:
            logger.error(f"IAM Archiving Job failed: {e}", exc_info=True)

    @staticmethod
    async def archive_old_logs(db: AsyncSession):
        cutoff_date = datetime.now() - timedelta(days=IAMAuditArchiver.RETENTION_DAYS)
        logger.info(f"Archiving logs older than {cutoff_date}")
        
        # 1. Fetch old logs (Limit batch size to avoid OOM)
        count_stmt = select(func.count()).where(IAMAuditLog.timestamp < cutoff_date)
        count_res = await db.execute(count_stmt)
        total_to_archive = count_res.scalar() or 0
        
        if total_to_archive == 0:
            logger.info("No logs to archive.")
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
                    logger.info(f"Deleted {len(log_ids)} archived logs from DB.")
                    
                except Exception as e:
                    logger.error(f"Failed to upload/delete batch: {e}")
                    await db.rollback()
                    break

            if len(logs) < limit:
                break
                
        logger.info("Archiving complete.")
