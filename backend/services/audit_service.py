import asyncio
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import uuid
from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)

class AuditService:
    @staticmethod
    async def _persist_business_action_with_new_session(
        *,
        user_id: int,
        username: str,
        action: str,
        target: str,
        status: str = "SUCCESS",
        detail: Optional[str] = None,
        ip_address: Optional[str] = None,
        trace_id: Optional[str] = None,
        domain: str = "BUSINESS",
    ):
        from database import SessionLocal

        async with SessionLocal() as db:
            await AuditService.log_business_action(
                db=db,
                user_id=user_id,
                username=username,
                action=action,
                target=target,
                status=status,
                detail=detail,
                ip_address=ip_address,
                trace_id=trace_id,
                domain=domain,
            )
            await db.commit()

    @staticmethod
    def enqueue_business_action(
        background_tasks: BackgroundTasks,
        *,
        user_id: int,
        username: str,
        action: str,
        target: str,
        status: str = "SUCCESS",
        detail: Optional[str] = None,
        ip_address: Optional[str] = None,
        trace_id: Optional[str] = None,
        domain: str = "BUSINESS",
    ):
        background_tasks.add_task(
            AuditService._persist_business_action_with_new_session,
            user_id=user_id,
            username=username,
            action=action,
            target=target,
            status=status,
            detail=detail,
            ip_address=ip_address,
            trace_id=trace_id,
            domain=domain,
        )

    @staticmethod
    def emit_business_action_fire_and_forget(
        *,
        user_id: int,
        username: str,
        action: str,
        target: str,
        status: str = "SUCCESS",
        detail: Optional[str] = None,
        ip_address: Optional[str] = None,
        trace_id: Optional[str] = None,
        domain: str = "BUSINESS",
    ):
        asyncio.create_task(
            AuditService._persist_business_action_with_new_session(
                user_id=user_id,
                username=username,
                action=action,
                target=target,
                status=status,
                detail=detail,
                ip_address=ip_address,
                trace_id=trace_id,
                domain=domain,
            )
        )

    @staticmethod
    def schedule_business_action(
        *,
        background_tasks: Optional[BackgroundTasks] = None,
        user_id: int,
        username: str,
        action: str,
        target: str,
        status: str = "SUCCESS",
        detail: Optional[str] = None,
        ip_address: Optional[str] = None,
        trace_id: Optional[str] = None,
        domain: str = "BUSINESS",
    ):
        if background_tasks is not None:
            AuditService.enqueue_business_action(
                background_tasks,
                user_id=user_id,
                username=username,
                action=action,
                target=target,
                status=status,
                detail=detail,
                ip_address=ip_address,
                trace_id=trace_id,
                domain=domain,
            )
            return

        AuditService.emit_business_action_fire_and_forget(
            user_id=user_id,
            username=username,
            action=action,
            target=target,
            status=status,
            detail=detail,
            ip_address=ip_address,
            trace_id=trace_id,
            domain=domain,
        )

    @staticmethod
    async def log_business_action(
        db: AsyncSession,
        user_id: int,
        username: str,
        action: str,
        target: str,
        status: str = "SUCCESS", # SUCCESS / FAIL
        detail: Optional[str] = None,
        ip_address: Optional[str] = None,
        trace_id: Optional[str] = None,
        domain: str = "BUSINESS" # BUSINESS / IAM / SYSTEM / AI
    ):
        """
        Log generic business action (e.g. CREATE_NEWS, UPDATE_USER).
        Uses BusinessLog model + sidecar LogSink.
        """
        try:
            # If trace_id not provided, try to get from context or generate one
            if not trace_id:
                try:
                    from middleware.trace_context import get_trace_id
                    trace_id = get_trace_id() or str(uuid.uuid4())
                except ImportError:
                    trace_id = str(uuid.uuid4())
                
            from models import BusinessLog
            
            log_entry = BusinessLog(
                operator=username,
                action=action,
                target=target,
                ip_address=ip_address,
                status=status,
                detail=detail,
                trace_id=trace_id,
                domain=domain,
                timestamp=datetime.now().isoformat()
            )
            
            db.add(log_entry)
            # Caller handles commit
            
            # --- Sidecar LogSink (Loki) ---
            try:
                from services.log_sink import get_log_sink, LogEntry
                from services.log_forwarder import emit_log_fire_and_forget
                sink = get_log_sink()
                if sink:
                    loki_entry = LogEntry(
                        trace_id=trace_id,
                        timestamp=datetime.utcnow().isoformat() + "Z",
                        level="INFO",
                        log_type=domain, # Use domain as log_type in Loki for isolation
                        action=action,
                        status=status,
                        user_id=user_id,
                        username=username,
                        target=target,
                        ip_address=ip_address,
                        detail=detail
                    )
                    # Sidecar network flush should not block request path.
                    asyncio.create_task(sink.emit(loki_entry))

                emit_log_fire_and_forget(
                    domain,
                    {
                        "trace_id": trace_id,
                        "operator": username,
                        "action": action,
                        "target": target,
                        "status": status,
                        "detail": detail,
                        "ip_address": ip_address,
                        "user_id": user_id,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    }
                )
            except Exception as e:
                logger.warning(f"LogSink emit failed (non-blocking): {e}")
            
        except Exception as e:
            logger.error(f"Failed to log business action: {e}")
