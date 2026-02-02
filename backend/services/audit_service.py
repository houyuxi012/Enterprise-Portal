import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from models import LoginAuditLog, User
from sqlalchemy import select
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

class AuditService:
    @staticmethod
    async def log_login(
        db: AsyncSession,
        username: str,
        success: bool,
        ip_address: str,
        user_agent: str,
        user_id: Optional[int] = None,
        reason: Optional[str] = None,
        trace_id: Optional[str] = None
    ):
        """
        Log login attempt (success or failure).
        """
        try:
            # If trace_id not provided, generate one
            if not trace_id:
                trace_id = str(uuid.uuid4())
            
            # If user_id not provided but success is True (or we want to try to find it for failure)
            if not user_id and username:
                # Try to find user to link ID
                result = await db.execute(select(User).filter(User.username == username))
                user = result.scalars().first()
                if user:
                    user_id = user.id

            log_entry = LoginAuditLog(
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                user_agent=user_agent,
                success=success,
                reason=reason,
                trace_id=trace_id,
                created_at=datetime.now().isoformat()
            )
            
            db.add(log_entry)
            await db.commit() 
            # Note: commit here breaks transaction isolation if caller expected atomic transaction.
            # But for Login, usually we want audit to persist immediately.
            
        except Exception as e:
            logger.error(f"Failed to log audit entry: {e}")
            # Do not raise exception to avoid blocking login flow

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
                    # Fire-and-forget to sidecar (non-blocking)
                    import asyncio
                    asyncio.create_task(sink.emit(loki_entry))
            except Exception as e:
                logger.warning(f"LogSink emit failed (non-blocking): {e}")
            
        except Exception as e:
            logger.error(f"Failed to log business action: {e}")

