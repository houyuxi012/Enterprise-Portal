"""
RBAC Service - 权限缓存与管理核心逻辑
"""
import json
import logging
from typing import Optional, Set, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from services.cache_manager import CacheManager

logger = logging.getLogger(__name__)

# Redis Key 前缀
PERM_VER_PREFIX = "iam:permver:user:"
PERM_DATA_PREFIX = "iam:perm:user:"
PERM_CACHE_TTL = 1800  # 30 分钟


class RBACService:
    """RBAC 权限服务（单例）"""
    
    _cache = CacheManager()
    
    @classmethod
    async def get_perm_version(cls, user_id: int) -> int:
        """获取用户权限版本号"""
        key = f"{PERM_VER_PREFIX}{user_id}"
        try:
            val = await cls._cache.get(key)
            if val is not None:
                return int(val)
        except Exception as e:
            logger.warning(f"获取 permVersion 失败: {e}")
        return 1
    
    @classmethod
    async def set_perm_version(cls, user_id: int, version: int):
        """设置用户权限版本号"""
        key = f"{PERM_VER_PREFIX}{user_id}"
        try:
            await cls._cache.set(key, str(version), ttl=None)
        except Exception as e:
            logger.warning(f"设置 permVersion 失败: {e}")
    
    @classmethod
    async def incr_perm_version(cls, user_id: int) -> int:
        """递增用户权限版本号"""
        current = await cls.get_perm_version(user_id)
        new_ver = current + 1
        await cls.set_perm_version(user_id, new_ver)
        logger.info(f"用户 {user_id} 权限版本更新: {current} -> {new_ver}")
        return new_ver
    
    @classmethod
    async def get_permissions_from_cache(cls, user_id: int, version: int) -> Optional[Tuple[List[dict], List[str]]]:
        """从缓存获取权限数据"""
        key = f"{PERM_DATA_PREFIX}{user_id}:v:{version}"
        try:
            val = await cls._cache.get(key)
            if val:
                data = json.loads(val)
                return data.get("roles", []), data.get("permissions", [])
        except Exception as e:
            logger.warning(f"获取权限缓存失败: {e}")
        return None
    
    @classmethod
    async def set_permissions_to_cache(cls, user_id: int, version: int, roles: List[dict], permissions: List[str]):
        """设置权限数据到缓存"""
        key = f"{PERM_DATA_PREFIX}{user_id}:v:{version}"
        try:
            data = {"roles": roles, "permissions": permissions}
            await cls._cache.set(key, json.dumps(data), ttl=PERM_CACHE_TTL)
            logger.debug(f"用户 {user_id} 权限已缓存 (v{version})")
        except Exception as e:
            logger.warning(f"设置权限缓存失败: {e}")
    
    @classmethod
    async def get_user_permissions(cls, user_id: int, db: AsyncSession) -> Tuple[List[dict], Set[str], int]:
        """
        获取用户权限集（优先从 Redis 读取）
        返回: (roles, permissions_set, perm_version)
        """
        import models
        
        version = await cls.get_perm_version(user_id)
        
        cached = await cls.get_permissions_from_cache(user_id, version)
        if cached:
            roles, perms = cached
            logger.debug(f"用户 {user_id} 权限缓存命中 (v{version})")
            return roles, set(perms), version
        
        logger.debug(f"用户 {user_id} 权限缓存未命中，从数据库加载")
        stmt = select(models.User).options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        ).filter(models.User.id == user_id)
        
        result = await db.execute(stmt)
        user = result.scalars().first()
        
        if not user:
            return [], set(), version
        
        roles_out = []
        permissions_set: Set[str] = set()
        
        for role in user.roles:
            roles_out.append({
                "id": role.id,
                "code": role.code,
                "name": role.name,
                "app_id": getattr(role, 'app_id', 'portal')
            })
            for perm in role.permissions:
                app_id = getattr(perm, 'app_id', 'portal')
                full_code = f"{app_id}.{perm.code}" if not perm.code.startswith(f"{app_id}.") else perm.code
                permissions_set.add(full_code)
                permissions_set.add(perm.code)
        
        await cls.set_permissions_to_cache(user_id, version, roles_out, list(permissions_set))
        
        return roles_out, permissions_set, version
    
    @classmethod
    async def invalidate_user(cls, user_id: int):
        """使用户权限缓存失效"""
        await cls.incr_perm_version(user_id)
    
    @classmethod
    async def invalidate_role(cls, role_id: int, db: AsyncSession):
        """使角色相关所有用户的权限缓存失效"""
        import models
        
        stmt = select(models.user_roles.c.user_id).where(
            models.user_roles.c.role_id == role_id
        )
        result = await db.execute(stmt)
        user_ids = [row[0] for row in result.fetchall()]
        
        for uid in user_ids:
            await cls.incr_perm_version(uid)
        
        logger.info(f"角色 {role_id} 变更，已失效 {len(user_ids)} 个用户的权限缓存")
