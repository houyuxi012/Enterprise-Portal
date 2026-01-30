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
