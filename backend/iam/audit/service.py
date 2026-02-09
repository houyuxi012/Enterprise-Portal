"""
IAM Audit Service - IAM 专用审计服务 (P2 Compliance)
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from iam.audit.models import IAMAuditLog

logger = logging.getLogger(__name__)

class IAMAuditService:
    """IAM 审计服务"""
    
    @staticmethod
    async def log(
        db: AsyncSession,
        action: str,
        target_type: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        target_id: Optional[int] = None,
        target_name: Optional[str] = None,
        detail: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        trace_id: Optional[str] = None,
        result: str = "success",
        reason: Optional[str] = None
    ):
        """通用日志记录 - 写入 DB 并推送到 Loki"""
        from iam.audit.models import IAMAuditLog
        from datetime import datetime
        
        # 1. Write to DB (primary)
        log_entry = IAMAuditLog(
            user_id=user_id,
            username=username,
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            detail=detail,
            result=result,
            reason=reason,
            ip_address=ip_address,
            user_agent=user_agent,
            trace_id=trace_id
        )
        
        db.add(log_entry)
        # 不自动 Commit，由调用方控制事务
        
        # 2. Push to Loki (sidecar, non-blocking)
        try:
            import os
            import httpx
            import json
            
            loki_push_url = os.getenv("LOKI_PUSH_URL", "http://loki:3100")
            if loki_push_url:
                timestamp_ns = str(int(datetime.now().timestamp() * 1e9))
                log_line = json.dumps({
                    "timestamp": datetime.now().isoformat(),
                    "action": action,
                    "target_type": target_type,
                    "target_id": target_id,
                    "target_name": target_name,
                    "user_id": user_id,
                    "username": username,
                    "result": result,
                    "reason": reason,
                    "ip_address": ip_address,
                    "detail": detail,
                    "trace_id": trace_id
                }, ensure_ascii=False)
                
                payload = {
                    "streams": [{
                        "stream": {
                            "job": "enterprise-portal",
                            "log_type": "IAM",
                            "source": "iam_audit"
                        },
                        "values": [[timestamp_ns, log_line]]
                    }]
                }
                
                # Fire-and-forget async push
                async with httpx.AsyncClient() as client:
                    await client.post(
                        f"{loki_push_url}/loki/api/v1/push",
                        json=payload,
                        timeout=2.0
                    )
        except Exception as e:
            # Non-blocking: log warning and continue
            logger.warning(f"Failed to push IAM audit log to Loki: {e}")
        
    # --- 预定义事件 ---
    
    @staticmethod
    async def log_login(
        db: AsyncSession,
        username: str,
        success: bool,
        ip_address: str = None,
        user_agent: str = None,
        user_id: int = None,
        reason: str = None,
        trace_id: str = None
    ):
        await IAMAuditService.log(
            db=db,
            action="iam.login.success" if success else "iam.login.fail",
            target_type="session",
            username=username,
            user_id=user_id,
            target_name=username,
            result="success" if success else "fail",
            reason=reason,
            ip_address=ip_address,
            user_agent=user_agent,
            trace_id=trace_id
        )

    @staticmethod
    async def log_logout(
        db: AsyncSession,
        username: str,
        user_id: int = None,
        ip_address: str = None,
        user_agent: str = None
    ):
         await IAMAuditService.log(
            db=db,
            action="iam.logout",
            target_type="session",
            user_id=user_id,
            username=username,
            target_name=username,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
    @staticmethod
    async def log_role_create(
        db: AsyncSession,
        operator: Any,
        role: Any,
        ip_address: str = None,
        trace_id: str = None
    ):
        await IAMAuditService.log(
            db=db,
            action="iam.role.create",
            target_type="role",
            user_id=operator.id,
            username=operator.username,
            target_id=role.id,
            target_name=role.code,
            detail={"name": role.name, "app_id": getattr(role, 'app_id', None)},
            ip_address=ip_address,
            trace_id=trace_id
        )
        
    @staticmethod
    async def log_role_update(
        db: AsyncSession,
        operator: Any,
        role: Any,
        changes: Dict,
        ip_address: str = None,
        trace_id: str = None
    ):
        await IAMAuditService.log(
            db=db,
            action="iam.role.update",
            target_type="role",
            user_id=operator.id,
            username=operator.username,
            target_id=role.id,
            target_name=role.code,
            detail={"changes": changes},
            ip_address=ip_address,
            trace_id=trace_id
        )

    @staticmethod
    async def log_role_delete(
        db: AsyncSession,
        operator: Any,
        role_code: str,
        role_id: int,
        ip_address: str = None,
        trace_id: str = None
    ):
        await IAMAuditService.log(
            db=db,
            action="iam.role.delete",
            target_type="role",
            user_id=operator.id,
            username=operator.username,
            target_id=role_id,
            target_name=role_code,
            ip_address=ip_address,
            trace_id=trace_id
        )

    @staticmethod
    async def log_user_update(
        db: AsyncSession,
        operator: Any,
        target_username: str,
        changes: Dict,
        ip_address: str = None,
        trace_id: str = None
    ):
          await IAMAuditService.log(
            db=db,
            action="iam.user.update",
            target_type="user",
            user_id=operator.id,
            username=operator.username,
            target_name=target_username,
            detail={"changes": changes},
            ip_address=ip_address,
            trace_id=trace_id
        )
