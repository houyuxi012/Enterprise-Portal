from fastapi import APIRouter, Depends, HTTPException, status, Request
import uuid
from services.audit_service import AuditService
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models, schemas, utils
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from iam.identity.service import IdentityService
from iam.deps import PermissionChecker
from dependencies import get_current_user
from iam.audit.service import IAMAuditService

router = APIRouter(
    prefix="/users",
    tags=["users"]
)



@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Refresh to load roles and permissions
    result = await db.execute(select(models.User).options(selectinload(models.User.roles).selectinload(models.Role.permissions)).filter(models.User.id == current_user.id))
    return result.scalars().first()

@router.get("/", response_model=List[schemas.User], dependencies=[Depends(PermissionChecker("sys:user:view"))])
async def read_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).options(selectinload(models.User.roles).selectinload(models.Role.permissions)))
    return result.scalars().all()

@router.get("/options", response_model=List[schemas.UserOption])
async def read_user_options(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Get minimal user list for dropdowns (Accessible to all authenticated users)
    """
    result = await db.execute(select(models.User))
    return result.scalars().all()


@router.post("/", response_model=schemas.User, status_code=status.HTTP_201_CREATED, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def create_user(
    request: Request,
    user: schemas.UserCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
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
        is_active=user.is_active
    )

    # Legacy 'role' field support: Map 'admin' string to RBAC Role if role_ids not provided
    # Future TODO: Remove this block once frontend sends role_ids
    if not user.role_ids and user.role:
        role_code = user.role if user.role != 'user' else None # 'user' is default, strict map 'admin'
        if role_code == 'admin':
             role_result = await db.execute(select(models.Role).filter(models.Role.code == 'admin'))
             admin_role = role_result.scalars().first()
             if admin_role:
                 db_user.roles = [admin_role]

    # Handle Explicit Role IDs (Overrides legacy)
    if user.role_ids:
         role_result = await db.execute(select(models.Role).filter(models.Role.id.in_(user.role_ids)))
         roles = role_result.scalars().all()
         db_user.roles = roles
    
    db.add(db_user)
    await db.commit()
    # Re-fetch with eager roles to support 'role' property access without MissingGreenlet
    result = await db.execute(
        select(models.User)
        .options(selectinload(models.User.roles))
        .filter(models.User.id == db_user.id)
    )
    db_user = result.scalars().first()
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db, action="iam.user.create", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=db_user.id, target_name=db_user.username,
        detail={"email": db_user.email, "role": db_user.role},
        ip_address=ip, trace_id=trace_id
    )

    await db.commit()

    # Re-fetch with roles loaded
    # Re-fetch with roles loaded
    result = await db.execute(select(models.User).options(selectinload(models.User.roles).selectinload(models.Role.permissions)).filter(models.User.id == db_user.id))
    created_user = result.scalars().first()

    # Log Action
    # Since dependencies run before, we don't have easy access to 'current_user' here unless we fetch it or pass it.
    # But PermissionChecker verifies permission but doesn't return user.
    # Ideally we should depend on 'get_current_user' too.
    # For now, let's use 'admin' or just the username from the log if we can.
    # Actually, we can add 'current_user' to the params even if unused, just for logging.
    
    # We will need to update signature to accept current_user if we want to log WHO did it.
    return created_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def delete_user(
    user_id: int, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
     result = await db.execute(select(models.User).filter(models.User.id == user_id))
     user = result.scalars().first()
     if not user:
         raise HTTPException(status_code=404, detail="User not found")
         
     target_name = user.username
     await db.delete(user)
     
     # Audit Log
     trace_id = request.headers.get("X-Request-ID")
     ip = request.client.host if request.client else "unknown"
     await IAMAuditService.log(
        db, action="iam.user.delete", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=user_id, target_name=target_name,
        ip_address=ip, trace_id=trace_id
     )

     await db.commit()

@router.put("/{user_id}", response_model=schemas.User, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def update_user(
    user_id: int, 
    request: Request,
    user_update: schemas.UserUpdate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.User).options(selectinload(models.User.roles).selectinload(models.Role.permissions)).filter(models.User.id == user_id))
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
    
    # Legacy 'role' field update support
    # If frontend sends 'role', map it to RBAC roles (e.g. 'admin' -> admin role)
    if 'role' in update_data:
        legacy_role = update_data.pop('role')
        if legacy_role == 'admin':
             role_result = await db.execute(select(models.Role).filter(models.Role.code == 'admin'))
             admin_role = role_result.scalars().first()
             if admin_role:
                 # Check if already has admin role to avoid dups or reset? 
                 # Simple logic: Add if not present, or replace? 
                 # Strategy: If legacy 'role' is sent, we assume it's the Primary intent.
                 # But 'role_ids' takes precedence above.
                 # Here we only act if role_ids was NOT in update_data (already popped)
                 pass # Actually, let's Append ensure 'admin' role is present if requested
                 
                 # Better Strategy: Just ignore 'role' since we moved to RBAC. 
                 # But to support legacy frontend switching "Admin" checkbox:
                 if admin_role not in user.roles:
                     user.roles.append(admin_role)
        # Note: We do NOT write to user.role column anymore (update_data.pop removes it)
             
    # Log logic will be added below commit

             
    for key, value in update_data.items():
        setattr(user, key, value)
        
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log_user_update(
        db, operator=current_user, target_username=user.username,
        changes=update_data, ip_address=ip, trace_id=trace_id
    )

        
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/reset-password", status_code=status.HTTP_200_OK, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def reset_password(
    request: Request,
    payload: schemas.PasswordResetRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.User).filter(models.User.username == payload.username))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Reset password
    new_pwd = payload.new_password if payload.new_password else "123456"
    
    # Fetch Password Policy
    config_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in config_result.scalars().all()}
    min_length = int(configs.get("security_password_min_length", 8))

    if len(new_pwd) < min_length:
        raise HTTPException(status_code=400, detail=f"Password must be at least {min_length} characters long")

    user.hashed_password = utils.get_password_hash(new_pwd)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db, action="iam.user.password_reset", target_type="user",
        user_id=current_user.id, username=current_user.username,
        target_id=user.id, target_name=user.username,
        ip_address=ip, trace_id=trace_id
    )

    
    await db.commit()
    return {"message": f"Password for {user.username} has been reset"}
