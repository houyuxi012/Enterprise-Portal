import time
import logging
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, exists, update, delete
from sqlalchemy.orm import selectinload
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
    "sys:role:view": "查看角色与权限",
    "sys:role:edit": "管理角色与权限",
    "content:news:edit": "管理新闻资讯",
    "content:announcement:edit": "管理通知公告",
    "content:tool:edit": "管理应用工具",
    "file:upload": "文件上传权限",
    # Logs & Audit
    "portal.logs.system.read": "查看系统日志",
    "portal.logs.business.read": "查看业务日志",
    "portal.logs.forwarding.admin": "管理日志转发",
    "portal.ai_audit.read": "查看AI审计",
    "portal.ai.chat.use": "使用AI对话助手",
    "portal.carousel.manage": "管理轮播图",
    # Knowledge Base
    "kb:manage": "管理知识库文档",
    "kb:query": "知识库检索",
    "todo:admin": "管理所有待办任务",
    "admin:access": "Access Admin Interface", # Critical permission for separate login
}

LEGACY_DEMO_PORTAL_USERNAMES = ("test_portal_plain", "test_portal_admin")


async def _merge_and_remove_legacy_admin_role(
    db: AsyncSession,
    role_map: dict[str, int],
) -> list[int]:
    """
    Legacy cleanup:
    - Merge legacy role `admin` into:
      - SuperAdmin for SYSTEM accounts
      - PortalAdmin for PORTAL accounts
    - Remove legacy `admin` role bindings and role row.
    Returns affected user IDs for cache invalidation.
    """
    legacy_admin_role_id = role_map.get("admin")
    if not legacy_admin_role_id:
        return []

    portal_admin_role_id = role_map.get("PortalAdmin")
    super_admin_role_id = role_map.get("SuperAdmin")
    if not portal_admin_role_id or not super_admin_role_id:
        logger.warning("Skip legacy admin-role merge: PortalAdmin/SuperAdmin not found.")
        return []

    legacy_users_result = await db.execute(
        select(models.User.id, models.User.account_type)
        .join(models.user_roles, models.user_roles.c.user_id == models.User.id)
        .where(models.user_roles.c.role_id == legacy_admin_role_id)
    )
    legacy_users = legacy_users_result.all()

    affected_user_ids: list[int] = []
    promote_rows = []
    for user_id, account_type in legacy_users:
        target_role_id = (
            super_admin_role_id
            if (str(account_type or "PORTAL").upper() == "SYSTEM")
            else portal_admin_role_id
        )
        promote_rows.append({"user_id": user_id, "role_id": target_role_id})
        affected_user_ids.append(user_id)

    if promote_rows:
        stmt = insert(models.user_roles).values(promote_rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_id", "role_id"])
        await db.execute(stmt)

    await db.execute(
        models.user_roles.delete().where(models.user_roles.c.role_id == legacy_admin_role_id)
    )
    await db.execute(
        models.role_permissions.delete().where(models.role_permissions.c.role_id == legacy_admin_role_id)
    )
    await db.execute(delete(models.Role).where(models.Role.id == legacy_admin_role_id))
    logger.info("Merged and removed legacy role 'admin' (affected users: %s)", len(affected_user_ids))
    return affected_user_ids


async def _cleanup_legacy_demo_portal_users(db: AsyncSession) -> list[int]:
    """
    Remove legacy demo users from production/system account list.
    Also clears dependent references that do not have ON DELETE CASCADE.
    """
    user_rows = (
        await db.execute(
            select(models.User.id, models.User.username).where(
                models.User.username.in_(LEGACY_DEMO_PORTAL_USERNAMES)
            )
        )
    ).all()
    if not user_rows:
        return []

    affected_user_ids = [row[0] for row in user_rows]
    affected_usernames = [row[1] for row in user_rows]

    await db.execute(delete(models.user_roles).where(models.user_roles.c.user_id.in_(affected_user_ids)))
    await db.execute(
        delete(models.UserPasswordHistory).where(
            models.UserPasswordHistory.user_id.in_(affected_user_ids)
        )
    )
    await db.execute(
        delete(models.AnnouncementRead).where(
            models.AnnouncementRead.user_id.in_(affected_user_ids)
        )
    )

    await db.execute(
        update(models.FileMetadata)
        .where(models.FileMetadata.uploader_id.in_(affected_user_ids))
        .values(uploader_id=None)
    )
    await db.execute(
        update(models.Notification)
        .where(models.Notification.created_by.in_(affected_user_ids))
        .values(created_by=None)
    )
    await db.execute(
        update(models.KBDocument)
        .where(models.KBDocument.created_by.in_(affected_user_ids))
        .values(created_by=None)
    )
    await db.execute(
        update(models.Todo)
        .where(models.Todo.creator_id.in_(affected_user_ids))
        .values(creator_id=None)
    )

    await db.execute(delete(models.User).where(models.User.id.in_(affected_user_ids)))
    logger.info("Removed legacy demo users: %s", ",".join(affected_usernames))
    return affected_user_ids


async def init_rbac(db: AsyncSession):
    """
    Idempotent RBAC Initialization (Production Grade)
    """
    logger.info("🚀 Starting RBAC Initialization...")

    # 1. Sync Permissions (Batch Upsert)
    print("Syncing Permissions...")
    perms_data = [
        {"app_id": "portal", "code": code, "description": desc}
        for code, desc in SYSTEM_PERMISSIONS.items()
    ]
    
    if perms_data:
        stmt = insert(models.Permission).values(perms_data)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_perm_app_code',  # Use named constraint
            set_={"description": stmt.excluded.description}
        )
        await db.execute(stmt)

    # 2. Sync Roles (Batch Upsert - Do Nothing if exists)
    print("Syncing Roles...")
    roles_data = [
        {"app_id": "portal", "code": "user", "name": "普通用户", "description": "默认门户用户", "limit_scope": True},
        {"app_id": "portal", "code": "PortalAdmin", "name": "门户管理员", "description": "门户后台管理员角色", "limit_scope": True},
        {"app_id": "portal", "code": "SuperAdmin", "name": "系统超级管理员", "description": "系统超级管理员角色", "limit_scope": False},
    ]
    stmt = insert(models.Role).values(roles_data)
    stmt = stmt.on_conflict_do_nothing(constraint='uq_role_app_code')  # Use named constraint
    await db.execute(stmt)
    # Keep role scope semantics stable on existing deployments
    await db.execute(
        update(models.Role)
        .where(models.Role.code.in_(["user", "PortalAdmin"]))
        .values(limit_scope=True)
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "SuperAdmin")
        .values(limit_scope=False)
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "user")
        .values(name="普通用户", description="默认门户用户")
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "PortalAdmin")
        .values(name="门户管理员", description="门户后台管理员角色")
    )
    await db.execute(
        update(models.Role)
        .where(models.Role.code == "SuperAdmin")
        .values(name="系统超级管理员", description="系统超级管理员角色")
    )

    # Flush to ensure IDs are generated/available
    await db.flush()

    # 3. Fetch IDs for Mapping
    # Fetch all permissions map
    perm_result = await db.execute(select(models.Permission))
    perm_map = {p.code: p.id for p in perm_result.scalars().all()}
    
    # Fetch all roles map
    role_result = await db.execute(select(models.Role))
    role_map = {r.code: r.id for r in role_result.scalars().all()}
    legacy_admin_affected_user_ids = await _merge_and_remove_legacy_admin_role(db, role_map)

    # Re-fetch role map after legacy cleanup to avoid stale role IDs.
    role_result = await db.execute(select(models.Role))
    role_map = {r.code: r.id for r in role_result.scalars().all()}

    demo_user_affected_ids = await _cleanup_legacy_demo_portal_users(db)

    # 4. Bind Permissions to Roles (SuperAdmin gets ALL)
    print("Binding SuperAdmin Permissions...")
    super_admin_role_id = role_map.get("SuperAdmin")
    if super_admin_role_id:
        role_perms_data = [
            {"role_id": super_admin_role_id, "permission_id": pid}
            for pid in perm_map.values()
        ]
        
        if role_perms_data:
            stmt = insert(models.role_permissions).values(role_perms_data)
            stmt = stmt.on_conflict_do_nothing(
                index_elements=['role_id', 'permission_id']
            )

            await db.execute(stmt)

    # 4.1 Bind Permissions to PortalAdmin (admin:access + backend modules)
    print("Binding PortalAdmin Permissions...")
    portal_admin_role_id = role_map.get("PortalAdmin")
    if portal_admin_role_id:
        target_perms = [
            "admin:access",
            "sys:settings:view",
            "sys:user:view",
            "sys:role:view",
            "content:news:edit",
            "content:announcement:edit",
            "content:tool:edit",
            "portal.logs.system.read",
            "portal.logs.business.read",
            "portal.logs.forwarding.admin",
            "portal.ai_audit.read",
            "portal.carousel.manage",
            "file:upload",
            "kb:manage",
            "todo:admin",
        ]
        
        pa_perms_data = []
        for code in target_perms:
             pid = perm_map.get(code)
             if pid:
                 pa_perms_data.append({"role_id": portal_admin_role_id, "permission_id": pid})
        
        if pa_perms_data:
             stmt = insert(models.role_permissions).values(pa_perms_data)
             stmt = stmt.on_conflict_do_nothing(index_elements=['role_id', 'permission_id'])
             await db.execute(stmt)

    # 5. Ensure Default Admin User Exists
    print("Ensuring Admin User...")
    admin_user_data = {
        "username": "admin",
        "email": "admin@example.com",
        "hashed_password": await utils.get_password_hash("admin"),
        "account_type": "SYSTEM",
        # "role": "admin", # Legacy field REMOVED
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
    stmt = select(models.User).where(~exists(subq)).options(selectinload(models.User.roles))
    
    result = await db.execute(stmt)
    users_without_roles = result.scalars().all()
    
    user_roles_data = []
    affected_user_ids = []
    if legacy_admin_affected_user_ids:
        affected_user_ids.extend(legacy_admin_affected_user_ids)
    if demo_user_affected_ids:
        affected_user_ids.extend(demo_user_affected_ids)
    
    for user in users_without_roles:
        # Determine Role
        target_role_id = role_map.get("user")
        if user.username == "admin":
            target_role_id = role_map.get("SuperAdmin")
            user.account_type = "SYSTEM"
        else:
            user.account_type = "PORTAL"
            
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

    # 6.1 Bind baseline permissions to regular user role
    user_role_id = role_map.get("user")
    ai_chat_permission_id = perm_map.get("portal.ai.chat.use")
    if user_role_id and ai_chat_permission_id:
        stmt = insert(models.role_permissions).values([
            {"role_id": user_role_id, "permission_id": ai_chat_permission_id}
        ])
        stmt = stmt.on_conflict_do_nothing(index_elements=['role_id', 'permission_id'])
        await db.execute(stmt)

    await db.commit()
    
    # 7. Invalidate Cache (Bump Permission Version)
    # Always invalidate "admin" user to ensure new permissions take effect
    result = await db.execute(select(models.User.id).filter(models.User.username == "admin"))
    admin_id = result.scalar()
    if admin_id:
        if admin_id not in affected_user_ids:
            affected_user_ids.append(admin_id)

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
