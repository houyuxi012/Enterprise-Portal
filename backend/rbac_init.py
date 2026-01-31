import time
import logging
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, exists
from sqlalchemy.dialects.postgresql import insert
import models
import utils
from services.cache_manager import cache

logger = logging.getLogger(__name__)

# Define system permissions (Code: Description)
SYSTEM_PERMISSIONS = {
    "sys:settings:view": "查看偏好设置",
    "sys:settings:edit": "管理偏好设置",
    "sys:user:view": "查看用户及角色",
    "sys:user:edit": "管理用户及角色",
    "sys:user:reset_pwd": "重置用户密码",
    "content:news:edit": "管理新闻资讯",
    "content:announcement:edit": "管理通知公告",
    "content:tool:edit": "管理应用工具",
    "file:upload": "文件上传权限",
}

async def init_rbac(db: AsyncSession):
    """
    Idempotent RBAC Initialization (Production Grade)
    """
    logger.info("🚀 Starting RBAC Initialization...")

    # 1. Sync Permissions (Batch Upsert)
    print("Syncing Permissions...")
    perms_data = [
        {"code": code, "description": desc}
        for code, desc in SYSTEM_PERMISSIONS.items()
    ]
    
    if perms_data:
        stmt = insert(models.Permission).values(perms_data)
        stmt = stmt.on_conflict_do_update(
            index_elements=['code'],
            set_={"description": stmt.excluded.description}
        )
        await db.execute(stmt)

    # 2. Sync Roles (Batch Upsert - Do Nothing if exists)
    print("Syncing Roles...")
    roles_data = [
        {"code": "admin", "name": "Administrator"},
        {"code": "user", "name": "Regular User"}
    ]
    stmt = insert(models.Role).values(roles_data)
    stmt = stmt.on_conflict_do_nothing(index_elements=['code'])
    await db.execute(stmt)

    # Flush to ensure IDs are generated/available
    await db.flush()

    # 3. Fetch IDs for Mapping
    # Fetch all permissions map
    perm_result = await db.execute(select(models.Permission))
    perm_map = {p.code: p.id for p in perm_result.scalars().all()}
    
    # Fetch all roles map
    role_result = await db.execute(select(models.Role))
    role_map = {r.code: r.id for r in role_result.scalars().all()}

    # 4. Bind Permissions to Roles (Admin gets ALL)
    print("Binding Admin Permissions...")
    admin_role_id = role_map.get("admin")
    if admin_role_id:
        role_perms_data = [
            {"role_id": admin_role_id, "permission_id": pid} 
            for pid in perm_map.values()
        ]
        
        if role_perms_data:
            stmt = insert(models.role_permissions).values(role_perms_data)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=['role_id', 'permission_id']
            )
            await db.execute(stmt)

    # 5. Ensure Default Admin User Exists
    print("Ensuring Admin User...")
    admin_user_data = {
        "username": "admin",
        "email": "admin@example.com",
        "hashed_password": utils.get_password_hash("admin"),
        "role": "admin", # Legacy field
        "is_active": True,
        "name": "Administrator",
        "avatar": "/images/admin-avatar.svg"
    }
    
    stmt = insert(models.User).values(admin_user_data)
    stmt = stmt.on_conflict_do_nothing(index_elements=['username'])
    await db.execute(stmt)

    # 6. Migrate Users (Bind Roles to Users who have NO roles)
    # Using 'NOT EXISTS' logic to avoid fetching all users
    # Performance optimization: Only fetch users that serve as migration targets
    print("Migrating Legacy Users...")
    
    # Select Users where NOT EXISTS in user_roles
    subq = select(1).where(models.user_roles.c.user_id == models.User.id)
    stmt = select(models.User).where(~exists(subq))
    
    result = await db.execute(stmt)
    users_without_roles = result.scalars().all()
    
    user_roles_data = []
    affected_user_ids = []
    
    for user in users_without_roles:
        # Determine Role
        target_role_id = role_map.get("user")
        if user.username == "admin" or user.role == "admin":
            target_role_id = role_map.get("admin")
            
        if target_role_id:
            user_roles_data.append({
                "user_id": user.id,
                "role_id": target_role_id
            })
            affected_user_ids.append(user.id)
            print(f" > Migrating User: {user.username} -> Role ID: {target_role_id}")

    if user_roles_data:
        stmt = insert(models.user_roles).values(user_roles_data)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=['user_id', 'role_id']
        )
        await db.execute(stmt)

    await db.commit()
    
    # 7. Invalidate Cache (Bump Permission Version)
    if affected_user_ids:
        print(f"Invalidating cache for {len(affected_user_ids)} users...")
        for uid in affected_user_ids:
            # Setting a version timestamp forces client re-fetch if implemented
            try:
                await cache.set(f"user_perm_ver:{uid}", int(time.time()), ttl=86400)
            except Exception as e:
                logger.warning(f"Cache update failed: {e}")

    print("✅ RBAC Initialization Complete.")

if __name__ == "__main__":
    from database import SessionLocal

    async def main():
        # Initialize Cache Manager manually since we are outside FastAPI app lifespan
        await cache.init()
        
        async with SessionLocal() as db:
            await init_rbac(db)
            
        await cache.close()

    asyncio.run(main())
