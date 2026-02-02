"""
IAM Admin 路由
/iam/admin/users, /iam/admin/roles, /iam/admin/permissions
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
import models, schemas, utils
from routers.auth import get_current_user
from services.audit_service import AuditService
from services.iam_cache import iam_cache

router = APIRouter(prefix="/admin", tags=["iam-admin"])


# ========== Permission Guard (使用缓存) ==========
async def get_user_with_permissions(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """获取用户及其权限集（Redis 优先）"""
    user = await get_current_user(request, db)
    _, permissions_set, _ = await iam_cache.get_user_permissions(user.id, db)
    return user, permissions_set


class PermissionRequired:
    """权限检查器（权限集模式）"""
    def __init__(self, required: str):
        self.required = required

    async def __call__(
        self,
        user_perms: tuple = Depends(get_user_with_permissions)
    ):
        user, perm_set = user_perms
        # 检查完整码或旧格式码
        if self.required not in perm_set:
            # 尝试添加默认 app_id 前缀
            full_code = f"portal.{self.required}"
            if full_code not in perm_set:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permission: {self.required}"
                )
        return user


# ========== Users CRUD ==========
@router.get("/users", response_model=List[schemas.User])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionRequired("sys:user:view"))
):
    result = await db.execute(
        select(models.User).options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        )
    )
    return result.scalars().all()


@router.post("/users", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    user: schemas.UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:user:edit"))
):
    # Check if user exists
    result = await db.execute(select(models.User).filter(models.User.username == user.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")

    # Fetch Password Policy
    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    min_length = int(configs.get("security_password_min_length", 8))

    if len(user.password) < min_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters long")
        
    pwd_hash = utils.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=pwd_hash,
        role=user.role,
        is_active=user.is_active
    )
    
    if user.role_ids:
        role_result = await db.execute(select(models.Role).filter(models.Role.id.in_(user.role_ids)))
        roles = role_result.scalars().all()
        db_user.roles = roles
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="CREATE_USER", target=f"用户:{db_user.username}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()

    result = await db.execute(
        select(models.User).options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        ).filter(models.User.id == db_user.id)
    )
    return result.scalars().first()


@router.put("/users/{user_id}", response_model=schemas.User)
async def update_user(
    user_id: int,
    request: Request,
    user_update: schemas.UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:user:edit"))
):
    result = await db.execute(
        select(models.User).options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        ).filter(models.User.id == user_id)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = user_update.dict(exclude_unset=True)
    
    # Handle Role IDs update
    if 'role_ids' in update_data:
        role_ids = update_data.pop('role_ids')
        if role_ids is not None:
            role_result = await db.execute(select(models.Role).filter(models.Role.id.in_(role_ids)))
            roles = role_result.scalars().all()
            user.roles = roles
            # 失效用户权限缓存
            await iam_cache.invalidate_user(user_id)
             
    for key, value in update_data.items():
        setattr(user, key, value)
        
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="UPDATE_USER", target=f"用户:{user.username}",
        ip_address=ip, trace_id=trace_id
    )
        
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:user:edit"))
):
    result = await db.execute(select(models.User).filter(models.User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
         
    target_name = user.username
    await db.delete(user)
     
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="DELETE_USER", target=f"用户:{target_name}",
        detail=f"Deleted user id={user_id}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()


# ========== Roles CRUD ==========
@router.get("/roles", response_model=List[schemas.Role])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionRequired("sys:role:view"))
):
    result = await db.execute(
        select(models.Role).options(selectinload(models.Role.permissions))
    )
    return result.scalars().all()


@router.post("/roles", response_model=schemas.Role, status_code=status.HTTP_201_CREATED)
async def create_role(
    request: Request,
    role: schemas.RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:role:edit"))
):
    # 检查 app_id + code 唯一性
    app_id = getattr(role, 'app_id', 'portal') or 'portal'
    existing = await db.execute(
        select(models.Role).filter(
            models.Role.app_id == app_id,
            models.Role.code == role.code
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Role with code '{role.code}' already exists in app '{app_id}'")
    
    db_role = models.Role(
        code=role.code,
        name=role.name,
        app_id=app_id
    )
    
    if role.permission_ids:
        perm_result = await db.execute(
            select(models.Permission).filter(models.Permission.id.in_(role.permission_ids))
        )
        db_role.permissions = perm_result.scalars().all()
    
    db.add(db_role)
    await db.commit()
    await db.refresh(db_role)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="CREATE_ROLE", target=f"角色:{db_role.code}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()
    
    result = await db.execute(
        select(models.Role).options(selectinload(models.Role.permissions)).filter(models.Role.id == db_role.id)
    )
    return result.scalars().first()


@router.put("/roles/{role_id}", response_model=schemas.Role)
async def update_role(
    role_id: int,
    request: Request,
    role_update: schemas.RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:role:edit"))
):
    result = await db.execute(
        select(models.Role).options(selectinload(models.Role.permissions)).filter(models.Role.id == role_id)
    )
    role = result.scalars().first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    update_data = role_update.dict(exclude_unset=True)
    
    if 'permission_ids' in update_data:
        perm_ids = update_data.pop('permission_ids')
        if perm_ids is not None:
            perm_result = await db.execute(
                select(models.Permission).filter(models.Permission.id.in_(perm_ids))
            )
            role.permissions = perm_result.scalars().all()
            # 失效该角色所有用户的权限缓存
            await iam_cache.invalidate_role(role_id, db)
    
    for key, value in update_data.items():
        setattr(role, key, value)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="UPDATE_ROLE", target=f"角色:{role.code}",
        ip_address=ip, trace_id=trace_id
    )
    
    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:role:edit"))
):
    result = await db.execute(select(models.Role).filter(models.Role.id == role_id))
    role = result.scalars().first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    # 失效该角色所有用户的权限缓存
    await iam_cache.invalidate_role(role_id, db)
    
    target_code = role.code
    await db.delete(role)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="DELETE_ROLE", target=f"角色:{target_code}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()


# ========== Permissions CRUD ==========
@router.get("/permissions", response_model=List[schemas.Permission])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _: models.User = Depends(PermissionRequired("sys:role:view"))
):
    result = await db.execute(select(models.Permission))
    return result.scalars().all()


@router.post("/permissions", response_model=schemas.Permission, status_code=status.HTTP_201_CREATED)
async def create_permission(
    request: Request,
    perm: schemas.PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(PermissionRequired("sys:role:edit"))
):
    app_id = getattr(perm, 'app_id', 'portal') or 'portal'
    existing = await db.execute(
        select(models.Permission).filter(
            models.Permission.app_id == app_id,
            models.Permission.code == perm.code
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Permission '{perm.code}' already exists in app '{app_id}'")
    
    db_perm = models.Permission(
        code=perm.code,
        description=perm.description,
        app_id=app_id
    )
    db.add(db_perm)
    await db.commit()
    await db.refresh(db_perm)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="CREATE_PERMISSION", target=f"权限:{db_perm.code}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()
    
    return db_perm
