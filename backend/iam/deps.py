"""
IAM 依赖注入模块
提供 get_current_identity / get_permissions / PermissionChecker
"""
import logging
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


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
    return await IdentityService.get_current_user(request, db)


async def get_permissions(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> tuple:
    """获取当前用户权限集，返回 (user, permissions_set, perm_version)"""
    from iam.rbac.service import RBACService
    user = await get_current_identity(request, db)
    roles, permissions_set, perm_version = await RBACService.get_user_permissions(user.id, db)
    return user, permissions_set, perm_version


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
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required: {required_code}"
            )
        return user
