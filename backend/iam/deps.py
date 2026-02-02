"""
IAM 依赖注入模块
提供 get_current_identity / get_permissions / PermissionChecker
"""
import logging
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt

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

    async def __call__(
        self,
        request: Request,
        db: AsyncSession = Depends(get_db)
    ):
        user, permissions_set, _ = await get_permissions(request, db)
        
        # 检查权限：支持完整码和旧格式码
        if self.required_permission not in permissions_set:
            # 尝试添加默认 app_id 前缀
            full_code = f"portal.{self.required_permission}"
            if full_code not in permissions_set:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Operation not permitted. Required: {self.required_permission}"
                )
        return user
