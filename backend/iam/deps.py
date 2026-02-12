"""
IAM 依赖注入模块
提供 get_current_identity / get_permissions / PermissionChecker
"""
import logging
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _infer_request_audience(request: Request) -> str | None:
    """
    Infer audience from route space to avoid mixed cookie resolution when
    admin_session and portal_session coexist in the same browser.
    """
    path = request.url.path or ""
    if path.startswith("/api/admin/"):
        return "admin"
    if path.startswith("/api/app/"):
        return "portal"
    return None


async def get_db():
    """数据库会话依赖 - 延迟导入避免循环"""
    from database import get_db as _get_db
    async for db in _get_db():
        yield db


async def get_current_identity(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """获取当前认证身份（User 对象）"""
    from iam.identity.service import IdentityService
    audience = _infer_request_audience(request)
    return await IdentityService.get_current_user(request, db, audience=audience)


async def get_permissions(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> tuple:
    """获取当前用户权限集，返回 (user, permissions_set, perm_version)"""
    from iam.rbac.service import RBACService
    user = await get_current_identity(request, db)
    roles, permissions_set, perm_version = await RBACService.get_user_permissions(user.id, db)
    return user, permissions_set, perm_version


async def _audit_authz_denied(
    *,
    db: AsyncSession,
    request: Request,
    user,
    required_code: str,
):
    """Best-effort authorization denial audit; must not break normal response path."""
    from services.audit_service import AuditService

    try:
        ip = request.client.host if request.client else "unknown"
        method = request.method
        path = request.url.path
        trace_id = request.headers.get("X-Request-ID")
        await AuditService.log_business_action(
            db=db,
            user_id=user.id,
            username=user.username,
            action="AUTHZ_DENIED",
            target=path,
            status="FAIL",
            detail=f"required={required_code}, method={method}",
            ip_address=ip,
            trace_id=trace_id,
            domain="IAM",
        )
        await db.commit()
    except Exception as e:
        logger.warning("Failed to persist authorization denial audit: %s", e)
        await db.rollback()


class PermissionChecker:
    """权限检查器（权限集模式，使用 Redis 缓存）"""
    
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    @staticmethod
    def _normalize_permission_code(required_permission: str, default_app_id: str = "portal") -> str:
        required = required_permission.strip()
        if "." in required:
            return required
        return f"{default_app_id}.{required}"

    async def __call__(
        self,
        request: Request,
        db: AsyncSession = Depends(get_db)
    ):
        user, permissions_set, _ = await get_permissions(request, db)

        required_code = self._normalize_permission_code(self.required_permission)
        if required_code not in permissions_set:
            await _audit_authz_denied(
                db=db,
                request=request,
                user=user,
                required_code=required_code,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required: {required_code}"
            )
        return user


async def verify_portal_aud(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """验证 Portal Audience"""
    from iam.identity.service import IdentityService
    # This will throw 401 if token is invalid or aud mismatch
    return await IdentityService.get_current_user(request, db, audience="portal")


async def verify_admin_aud(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """验证 Admin Audience"""
    from iam.identity.service import IdentityService
    user = await IdentityService.get_current_user(request, db, audience="admin")
    if not IdentityService._can_login_admin(user):
        await _audit_authz_denied(
            db=db,
            request=request,
            user=user,
            required_code="portal.admin:access",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access has been revoked.",
        )
    return user
