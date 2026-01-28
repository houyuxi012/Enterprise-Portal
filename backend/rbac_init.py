from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import models
import utils

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
    # 1. Sync Permissions
    print("Syncing Permissions...")
    all_perms = {}
    for code, desc in SYSTEM_PERMISSIONS.items():
        result = await db.execute(select(models.Permission).filter(models.Permission.code == code))
        perm = result.scalars().first()
        if not perm:
            perm = models.Permission(code=code, description=desc)
            db.add(perm)
        else:
            # Update description if changed (e.g. localization)
            if perm.description != desc:
                perm.description = desc
        all_perms[code] = perm
    
    # 2. Sync Roles
    print("Syncing Roles...")
    # Admin Role
    admin_role_stmt = await db.execute(select(models.Role).filter(models.Role.code == "admin"))
    admin_role = admin_role_stmt.scalars().first()
    if not admin_role:
        admin_role = models.Role(code="admin", name="Administrator")
        db.add(admin_role)
    
    # User Role
    user_role_stmt = await db.execute(select(models.Role).filter(models.Role.code == "user"))
    user_role = user_role_stmt.scalars().first()
    if not user_role:
        user_role = models.Role(code="user", name="Regular User")
        db.add(user_role)
    
    await db.flush() # Get IDs

    # 3. Assign Permissions to Roles
    # Admin gets ALL permissions
    # We need to manage M:N relationship manually or via ORM if loaded
    # Using ORM requires async loading of relationships which can be tricky.
    # Let's use direct table checks or assumes fresh
    
    # For simplicity, we just ensure Admin has relationships.
    # However, 'admin_role' object attached to session might not have collection loaded unless we refresh with joinedload.
    # Simplest way: Direct insert into role_permissions for missing pairs.
    # But ORM appending is safer if we refresh.
    
    # Let's simple strategy: Re-query Role with permissions loaded
    # Actually, let's just use a helper or trust standard ORM with flush.
    
    # Refresh to be safe
    await db.refresh(admin_role, attribute_names=['permissions'])
    
    existing_perm_ids = {p.id for p in admin_role.permissions}
    for perm in all_perms.values():
        if perm.id not in existing_perm_ids:
            admin_role.permissions.append(perm)
            
    # User Permissions (Example: just upload?)
    # For now user has none or specific ones
    
    # 4. Migrate Legacy Users & Ensure Admin Exists
    # Find users with role="admin" string but no roles relation
    result = await db.execute(select(models.User))
    users = result.scalars().all()
    
    # Check if admin user exists at all
    admin_user = next((u for u in users if u.username == 'admin'), None)
    if not admin_user:
        print("Creating default admin user...")
        import utils # local import to avoid circular if at top level? No, utils is fine
        admin_user = models.User(
            username="admin", 
            email="admin@example.com", 
            hashed_password=utils.get_password_hash("admin"),
            role="admin", # Legacy
            is_active=True
        )
        db.add(admin_user)
        users.append(admin_user) # Add to list for role assignment below

    for user in users:
        # Load roles
        await db.refresh(user, attribute_names=['roles'])
        if not user.roles:
            if user.username == 'admin' or user.role == "admin":
                user.roles.append(admin_role)
            else:
                user.roles.append(user_role)
    
    await db.commit()
    print("RBAC Initialization Complete.")
