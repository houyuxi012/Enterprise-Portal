"""
RBAC Router - 用户/角色/权限管理路由
/iam/admin/users, /iam/admin/roles, /iam/admin/permissions
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from iam.deps import get_db, PermissionChecker, verify_admin_aud
from .service import RBACService
from . import schemas
import models, utils
from services.audit_service import AuditService
from iam.audit.service import IAMAuditService

router = APIRouter(
    prefix="/admin",
    tags=["iam-rbac"],
    dependencies=[Depends(verify_admin_aud)],
)
PORTAL_APP_ID = "portal"
RESERVED_ROLE_CODES = {"user", "portaladmin", "portal_admin", "superadmin"}


def _is_reserved_role_code(role_code: str) -> bool:
    return (role_code or "").strip().lower() in RESERVED_ROLE_CODES


def _is_protected_system_admin(user: models.User) -> bool:
    account_type = (getattr(user, "account_type", "PORTAL") or "PORTAL").upper()
    username = (getattr(user, "username", "") or "").strip().lower()
    return account_type == "SYSTEM" and username == "admin"


async def _load_roles_by_ids(db: AsyncSession, role_ids: List[int], app_id: str = PORTAL_APP_ID) -> List[models.Role]:
    unique_role_ids = list(set(role_ids))
    if not unique_role_ids:
        return []

    role_result = await db.execute(
        select(models.Role).filter(
            models.Role.id.in_(unique_role_ids),
            models.Role.app_id == app_id,
        )
    )
    roles = role_result.scalars().all()
    if len(roles) != len(unique_role_ids):
        raise HTTPException(status_code=400, detail="Some role_ids are invalid")
    return roles


async def _load_permissions_by_ids(
    db: AsyncSession, permission_ids: List[int], app_id: str = PORTAL_APP_ID
) -> List[models.Permission]:
    unique_permission_ids = list(set(permission_ids))
    if not unique_permission_ids:
        return []

    perm_result = await db.execute(
        select(models.Permission).filter(
            models.Permission.id.in_(unique_permission_ids),
            models.Permission.app_id == app_id,
        )
    )
    permissions = perm_result.scalars().all()
    if len(permissions) != len(unique_permission_ids):
        raise HTTPException(status_code=400, detail="Some permission_ids are invalid")
    return permissions


# ========== Users CRUD ==========
@router.get("/users", response_model=List[schemas.UserOut])
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


@router.get("/users/options", response_model=List[schemas.UserOption])
async def list_user_options(
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("sys:user:view"))
):
    result = await db.execute(select(models.User))
    return result.scalars().all()


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    user_data: schemas.UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    existing = await db.execute(select(models.User).filter(models.User.username == user_data.username))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")

    if user_data.email:
        email_exists = await db.execute(select(models.User).filter(models.User.email == user_data.email))
        if email_exists.scalars().first():
            raise HTTPException(status_code=400, detail="Email already registered")

    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    min_length = int(configs.get("security_password_min_length", 8))

    password = user_data.password
    if len(password) < min_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters")

    db_user = models.User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=utils.get_password_hash(password),
        account_type="PORTAL",
        is_active=user_data.is_active,
        name=user_data.name,
        avatar=user_data.avatar,
    )
    assigned_role_codes: List[str] = []

    role_ids = list(user_data.role_ids or [])
    if role_ids:
        matched_roles = await _load_roles_by_ids(db, role_ids, PORTAL_APP_ID)
        db_user.roles = matched_roles
        assigned_role_codes = [role.code for role in matched_roles]
    else:
        target_role = user_data.role or "user"
        normalized_target_role = (target_role or "").strip().lower()
        if normalized_target_role in {"admin", "portal_admin", "portaladmin"}:
            # Legacy compatibility: old "admin" alias now maps to PortalAdmin.
            target_role = "PortalAdmin"
        default_role_result = await db.execute(
            select(models.Role).filter(
                models.Role.code == target_role,
                models.Role.app_id == PORTAL_APP_ID,
            )
        )
        default_role = default_role_result.scalars().first()
        if not default_role:
            raise HTTPException(status_code=400, detail=f"Role '{target_role}' not found")
        db_user.roles = [default_role]
        assigned_role_codes = [default_role.code]
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db, action="iam.user.create", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=db_user.id, target_name=db_user.username,
        detail={"email": db_user.email, "roles": assigned_role_codes},
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
    user_update: schemas.UserUpdate,
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

    update_data = user_update.dict(exclude_unset=True)
    changes = {}

    if _is_protected_system_admin(user) and update_data.get("is_active") is False:
        raise HTTPException(status_code=403, detail="系统内置 admin 账户不可禁用")

    if 'role_ids' in update_data:
        role_ids = update_data.pop('role_ids')
        if role_ids is not None:
            matched_roles = await _load_roles_by_ids(db, role_ids, PORTAL_APP_ID)
            user.roles = matched_roles
            await RBACService.invalidate_user(user_id)
            changes["role_ids"] = role_ids

    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    min_length = int(configs.get("security_password_min_length", 8))

    if "password" in update_data:
        new_password = update_data.pop("password")
        if new_password is not None:
            if len(new_password) < min_length:
                raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters")
            user.hashed_password = utils.get_password_hash(new_password)
            changes["password"] = "***"

    if "username" in update_data and update_data["username"] and update_data["username"] != user.username:
        username_exists = await db.execute(select(models.User).filter(models.User.username == update_data["username"]))
        if username_exists.scalars().first():
            raise HTTPException(status_code=400, detail="Username already registered")
    elif "username" in update_data and not update_data["username"]:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    if "email" in update_data and update_data["email"] != user.email:
        if update_data["email"]:
            email_exists = await db.execute(select(models.User).filter(models.User.email == update_data["email"]))
            if email_exists.scalars().first():
                raise HTTPException(status_code=400, detail="Email already registered")

    allowed_fields = {"username", "email", "is_active", "name", "avatar"}
    for key in list(update_data.keys()):
        if key in allowed_fields:
            setattr(user, key, update_data[key])
            changes[key] = update_data[key]

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log_user_update(
        db, operator=current_user, target_username=user.username,
        changes=changes, ip_address=ip, trace_id=trace_id
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

    if _is_protected_system_admin(user):
        raise HTTPException(status_code=403, detail="系统内置 admin 账户不可删除")
    
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


async def _get_portal_admin_role(db: AsyncSession) -> models.Role:
    role_result = await db.execute(
        select(models.Role).filter(
            models.Role.code == "PortalAdmin",
            models.Role.app_id == PORTAL_APP_ID,
        )
    )
    role = role_result.scalars().first()
    if not role:
        raise HTTPException(status_code=500, detail="PortalAdmin role is not initialized")
    return role


@router.post("/users/{user_id}/portal-admin/grant")
async def grant_portal_admin(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(
        select(models.User).options(selectinload(models.User.roles)).filter(models.User.id == user_id)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if (getattr(user, "account_type", "PORTAL") or "PORTAL").upper() != "PORTAL":
        raise HTTPException(status_code=400, detail="Only PORTAL users can be granted PortalAdmin")

    portal_admin_role = await _get_portal_admin_role(db)
    already_assigned = any(r.id == portal_admin_role.id for r in user.roles)
    if not already_assigned:
        user.roles.append(portal_admin_role)
        await RBACService.invalidate_user(user.id)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db=db,
        action="iam.role.assign",
        target_type="user_role",
        user_id=current_user.id,
        username=current_user.username,
        target_id=user.id,
        target_name=user.username,
        detail={
            "role": "PortalAdmin",
            "operation": "grant",
            "already_assigned": already_assigned,
        },
        ip_address=ip,
        trace_id=trace_id,
    )
    await db.commit()
    return {
        "id": user.id,
        "username": user.username,
        "account_type": user.account_type,
        "portal_admin": True,
        "changed": not already_assigned,
    }


@router.post("/users/{user_id}/portal-admin/revoke")
async def revoke_portal_admin(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(
        select(models.User).options(selectinload(models.User.roles)).filter(models.User.id == user_id)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    portal_admin_role = await _get_portal_admin_role(db)
    before = len(user.roles)
    user.roles = [r for r in user.roles if r.id != portal_admin_role.id]
    changed = len(user.roles) != before
    if changed:
        await RBACService.invalidate_user(user.id)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db=db,
        action="iam.role.revoke",
        target_type="user_role",
        user_id=current_user.id,
        username=current_user.username,
        target_id=user.id,
        target_name=user.username,
        detail={
            "role": "PortalAdmin",
            "operation": "revoke",
            "changed": changed,
        },
        ip_address=ip,
        trace_id=trace_id,
    )
    await db.commit()
    return {
        "id": user.id,
        "username": user.username,
        "account_type": user.account_type,
        "portal_admin": False,
        "changed": changed,
    }


@router.post("/users/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    request: Request,
    payload: schemas.PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:user:edit"))
):
    result = await db.execute(select(models.User).filter(models.User.username == payload.username))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    min_length = int(configs.get("security_password_min_length", 8))
    provided_password = (payload.new_password or "").strip()
    auto_generated = False
    if provided_password:
        new_pwd = provided_password
    else:
        auto_generated = True
        default_pwd = "12345678"
        new_pwd = default_pwd if len(default_pwd) >= min_length else default_pwd + ("0" * (min_length - len(default_pwd)))

    if len(new_pwd) < min_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters long")

    user.hashed_password = utils.get_password_hash(new_pwd)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db, action="iam.user.password_reset", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=user.id, target_name=user.username,
        ip_address=ip, trace_id=trace_id
    )
    await AuditService.log_business_action(
        db, user_id=current_user.id, username=current_user.username,
        action="RESET_USER_PASSWORD", target=f"用户:{user.username}",
        ip_address=ip, trace_id=trace_id
    )
    await db.commit()
    return {
        "message": f"Password for {user.username} has been reset",
        "new_password": new_pwd if auto_generated else None,
    }


# ========== Roles CRUD ==========
@router.get("/roles", response_model=List[schemas.Role])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("sys:role:view"))
):
    result = await db.execute(
        select(models.Role)
        .options(selectinload(models.Role.permissions))
        .filter(models.Role.app_id == PORTAL_APP_ID)
    )
    return result.scalars().all()


@router.post("/roles", response_model=schemas.Role, status_code=status.HTTP_201_CREATED)
async def create_role(
    request: Request,
    role: schemas.RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:role:edit"))
):
    if role.app_id and role.app_id != PORTAL_APP_ID:
        raise HTTPException(status_code=400, detail=f"Only app_id='{PORTAL_APP_ID}' is allowed on this endpoint")
    app_id = PORTAL_APP_ID
    existing = await db.execute(
        select(models.Role).filter(
            models.Role.app_id == app_id,
            models.Role.code == role.code
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Role '{role.code}' already exists")
    
    db_role = models.Role(
        code=role.code,
        name=role.name,
        description=role.description,
        app_id=app_id,
    )
    
    if role.permission_ids:
        db_role.permissions = await _load_permissions_by_ids(db, role.permission_ids, app_id)
    
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
        select(models.Role)
        .options(selectinload(models.Role.permissions))
        .filter(models.Role.id == role_id, models.Role.app_id == PORTAL_APP_ID)
    )
    role = result.scalars().first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    update_data = role_update.dict(exclude_unset=True)
    
    if 'permission_ids' in update_data:
        perm_ids = update_data.pop('permission_ids')
        if perm_ids is not None:
            role.permissions = await _load_permissions_by_ids(db, perm_ids, role.app_id or PORTAL_APP_ID)
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
    result = await db.execute(
        select(models.Role).filter(models.Role.id == role_id, models.Role.app_id == PORTAL_APP_ID)
    )
    role = result.scalars().first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if _is_reserved_role_code(role.code):
        raise HTTPException(status_code=400, detail=f"Cannot delete built-in role '{role.code}'")
    
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
    result = await db.execute(
        select(models.Permission).filter(models.Permission.app_id == PORTAL_APP_ID)
    )
    return result.scalars().all()


@router.post("/permissions", response_model=schemas.Permission, status_code=status.HTTP_201_CREATED)
async def create_permission(
    request: Request,
    perm: schemas.PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("sys:role:edit"))
):
    if perm.app_id and perm.app_id != PORTAL_APP_ID:
        raise HTTPException(status_code=400, detail=f"Only app_id='{PORTAL_APP_ID}' is allowed on this endpoint")
    app_id = PORTAL_APP_ID
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
