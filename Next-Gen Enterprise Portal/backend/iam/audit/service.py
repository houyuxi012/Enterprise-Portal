"""
IAM Audit Service - IAM 专用审计服务 (P2 Compliance)
"""
import logging
import re
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from iam.audit.models import IAMAuditLog

logger = logging.getLogger(__name__)

class IAMAuditService:
    """IAM 审计服务"""

    @staticmethod
    def _parse_user_agent(user_agent: Optional[str]) -> Dict[str, str]:
        ua = (user_agent or "").strip()
        ua_lower = ua.lower()
        if not ua:
            return {"device_type": "unknown", "os": "unknown", "browser": "unknown"}

        # Device type
        device_type = "desktop"
        if any(k in ua_lower for k in ("bot", "spider", "crawler", "curl", "postman")):
            device_type = "bot"
        elif any(k in ua_lower for k in ("ipad", "tablet")):
            device_type = "tablet"
        elif any(k in ua_lower for k in ("mobile", "iphone", "android")):
            device_type = "mobile"

        # OS
        os_name = "unknown"
        if "windows nt 10.0" in ua_lower:
            os_name = "Windows 10/11"
        elif "windows nt 6.3" in ua_lower:
            os_name = "Windows 8.1"
        elif "windows nt 6.1" in ua_lower:
            os_name = "Windows 7"
        elif "iphone os" in ua_lower or "cpu iphone os" in ua_lower:
            m = re.search(r"(?:iphone os|cpu iphone os)\s+([\d_]+)", ua_lower)
            os_name = f"iOS {m.group(1).replace('_', '.')}" if m else "iOS"
        elif "android" in ua_lower:
            m = re.search(r"android\s+([\d.]+)", ua_lower)
            os_name = f"Android {m.group(1)}" if m else "Android"
        elif "mac os x" in ua_lower:
            m = re.search(r"mac os x\s+([\d_]+)", ua_lower)
            os_name = f"macOS {m.group(1).replace('_', '.')}" if m else "macOS"
        elif "linux" in ua_lower:
            os_name = "Linux"
        elif "cros" in ua_lower:
            os_name = "ChromeOS"

        # Browser
        browser = "unknown"
        if "edg/" in ua_lower:
            m = re.search(r"edg/([\d.]+)", ua_lower)
            browser = f"Edge {m.group(1)}" if m else "Edge"
        elif "opr/" in ua_lower or "opera" in ua_lower:
            m = re.search(r"(?:opr|opera)/([\d.]+)", ua_lower)
            browser = f"Opera {m.group(1)}" if m else "Opera"
        elif "firefox/" in ua_lower:
            m = re.search(r"firefox/([\d.]+)", ua_lower)
            browser = f"Firefox {m.group(1)}" if m else "Firefox"
        elif "chrome/" in ua_lower and "chromium" not in ua_lower:
            m = re.search(r"chrome/([\d.]+)", ua_lower)
            browser = f"Chrome {m.group(1)}" if m else "Chrome"
        elif "safari/" in ua_lower and "chrome/" not in ua_lower and "chromium" not in ua_lower:
            m = re.search(r"version/([\d.]+)", ua_lower)
            browser = f"Safari {m.group(1)}" if m else "Safari"
        elif "trident/" in ua_lower or "msie" in ua_lower:
            browser = "Internet Explorer"

        return {
            "device_type": device_type,
            "os": os_name,
            "browser": browser,
        }

    @staticmethod
    def _build_detail_with_client_context(
        detail: Optional[Any],
        user_agent: Optional[str],
    ) -> Dict[str, Any]:
        context = IAMAuditService._parse_user_agent(user_agent)
        if detail is None:
            return {"client_context": context}
        if isinstance(detail, dict):
            merged = dict(detail)
            existing_ctx = merged.get("client_context")
            if not isinstance(existing_ctx, dict):
                merged["client_context"] = context
            else:
                ctx = dict(existing_ctx)
                for key, value in context.items():
                    ctx.setdefault(key, value)
                merged["client_context"] = ctx
            return merged
        return {"original_detail": detail, "client_context": context}
    
    @staticmethod
    async def log(
        db: AsyncSession,
        action: str,
        target_type: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        target_id: Optional[int] = None,
        target_name: Optional[str] = None,
        detail: Optional[Any] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        trace_id: Optional[str] = None,
        result: str = "success",
        reason: Optional[str] = None
    ):
        """通用日志记录 - 写入 DB 并推送到 Loki"""
        from iam.audit.models import IAMAuditLog
        from datetime import datetime
        enriched_detail = IAMAuditService._build_detail_with_client_context(detail, user_agent)
        client_context = enriched_detail.get("client_context", {})
        
        # 1. Write to DB (primary)
        log_entry = IAMAuditLog(
            user_id=user_id,
            username=username,
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            detail=enriched_detail,
            result=result,
            reason=reason,
            ip_address=ip_address,
            user_agent=user_agent,
            trace_id=trace_id
        )
        
        db.add(log_entry)
        # 不自动 Commit，由调用方控制事务

        # 1.5 Forward to external sinks (non-blocking)
        try:
            from services.log_forwarder import emit_log_fire_and_forget
            emit_log_fire_and_forget(
                "IAM",
                {
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
                    "user_agent": user_agent,
                    "device_type": client_context.get("device_type"),
                    "os": client_context.get("os"),
                    "browser": client_context.get("browser"),
                    "detail": enriched_detail,
                    "trace_id": trace_id,
                }
            )
        except Exception as e:
            logger.warning(f"Failed to forward IAM audit log (non-blocking): {e}")
        
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
                    "user_agent": user_agent,
                    "device_type": client_context.get("device_type"),
                    "os": client_context.get("os"),
                    "browser": client_context.get("browser"),
                    "detail": enriched_detail,
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
                        timeout=2.0,
                        headers={"X-Scope-OrgID": os.getenv("LOKI_TENANT_ID", "enterprise-portal")}
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
