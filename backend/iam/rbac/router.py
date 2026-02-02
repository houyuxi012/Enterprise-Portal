"""
RBAC Router - 用户/角色/权限管理路由
/iam/admin/users, /iam/admin/roles, /iam/admin/permissions
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from iam.deps import get_db, PermissionChecker
from .service import RBACService
from . import schemas
import models, utils
from services.audit_service import AuditService
from iam.audit.service import IAMAuditService

router = APIRouter(prefix="/admin", tags=["iam-rbac"])


# ========== Users CRUD ==========
@router.get("/users", response_model=List[schemas.Role])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("sys:user:view"))
):
    result = await db.execute(
        select(models.User).options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        )
    )
    return result.scalars().all()


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    user_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    existing = await db.execute(select(models.User).filter(models.User.username == user_data.get("username")))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
    
    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    min_length = int(configs.get("security_password_min_length", 8))
    
    password = user_data.get("password", "")
    if len(password) < min_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters")
    
    db_user = models.User(
        username=user_data.get("username"),
        email=user_data.get("email"),
        hashed_password=utils.get_password_hash(password),
        role=user_data.get("role", "user"),
        is_active=user_data.get("is_active", True)
    )
    
    role_ids = user_data.get("role_ids", [])
    if role_ids:
        role_result = await db.execute(select(models.Role).filter(models.Role.id.in_(role_ids)))
        db_user.roles = role_result.scalars().all()
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db, action="iam.user.create", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=db_user.id, target_name=db_user.username,
        detail={"email": db_user.email, "role": db_user.role},
        ip_address=ip, trace_id=trace_id
    )
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="CREATE_USER", target=f"用户:{db_user.username}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()
    
    return {"id": db_user.id, "username": db_user.username}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    request: Request,
    user_update: dict,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(
        select(models.User).options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        ).filter(models.User.id == user_id)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if 'role_ids' in user_update:
        role_ids = user_update.pop('role_ids')
        if role_ids is not None:
            role_result = await db.execute(select(models.Role).filter(models.Role.id.in_(role_ids)))
            user.roles = role_result.scalars().all()
            await RBACService.invalidate_user(user_id)
    
    for key, value in user_update.items():
        if hasattr(user, key):
            setattr(user, key, value)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log_user_update(
        db, operator=current_user, target_username=user.username,
        changes=user_update, ip_address=ip, trace_id=trace_id
    )
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="UPDATE_USER", target=f"用户:{user.username}",
        ip_address=ip, trace_id=trace_id
    )
    
    await db.commit()
    return {"id": user.id, "username": user.username}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(select(models.User).filter(models.User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_name = user.username
    await db.delete(user)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db, action="iam.user.delete", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=user_id, target_name=target_name,
        ip_address=ip, trace_id=trace_id
    )
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="DELETE_USER", target=f"用户:{target_name}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()


# ========== Roles CRUD ==========
@router.get("/roles", response_model=List[schemas.Role])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("sys:role:view"))
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
    current_user=Depends(PermissionChecker("sys:role:edit"))
):
    from sqlalchemy.dialects.postgresql import insert
    
    app_id = role.app_id or 'portal'
    existing = await db.execute(
        select(models.Role).filter(
            models.Role.app_id == app_id,
            models.Role.code == role.code
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Role '{role.code}' already exists")
    
    db_role = models.Role(code=role.code, name=role.name, app_id=app_id)
    
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
    await IAMAuditService.log_role_create(
        db, operator=current_user, role=db_role,
        ip_address=ip, trace_id=trace_id
    )
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
    current_user=Depends(PermissionChecker("sys:role:edit"))
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
            await RBACService.invalidate_role(role_id, db)
    
    for key, value in update_data.items():
        setattr(role, key, value)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log_role_update(
        db, operator=current_user, role=role,
        changes=update_data, ip_address=ip, trace_id=trace_id
    )
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
    current_user=Depends(PermissionChecker("sys:role:edit"))
):
    result = await db.execute(select(models.Role).filter(models.Role.id == role_id))
    role = result.scalars().first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    await RBACService.invalidate_role(role_id, db)
    
    target_code = role.code
    await db.delete(role)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log_role_delete(
        db, operator=current_user, role_code=target_code, role_id=role_id,
        ip_address=ip, trace_id=trace_id
    )
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
    _=Depends(PermissionChecker("sys:role:view"))
):
    result = await db.execute(select(models.Permission))
    return result.scalars().all()


@router.post("/permissions", response_model=schemas.Permission, status_code=status.HTTP_201_CREATED)
async def create_permission(
    request: Request,
    perm: schemas.PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:role:edit"))
):
    app_id = perm.app_id or 'portal'
    existing = await db.execute(
        select(models.Permission).filter(
            models.Permission.app_id == app_id,
            models.Permission.code == perm.code
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Permission '{perm.code}' already exists")
    
    db_perm = models.Permission(code=perm.code, description=perm.description, app_id=app_id)
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
