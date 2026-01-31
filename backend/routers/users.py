from fastapi import APIRouter, Depends, HTTPException, status, Request
import uuid
from services.audit_service import AuditService
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models, schemas, utils
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from routers.auth import get_current_user
from dependencies import PermissionChecker

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
        role=user.role, # Legacy support
        is_active=user.is_active
    )
    
    # Handle Roles
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
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_USER", 
        target=f"用户:{db_user.username}", 
        ip_address=ip,
        trace_id=trace_id
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
     await AuditService.log_business_action(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="DELETE_USER",
        target=f"用户:{target_name}",
        detail=f"Deleted user id={user_id}",
        ip_address=ip,
        trace_id=trace_id
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
             roles = role_result.scalars().all()
             user.roles = roles
             
    # Log logic will be added below commit

             
    for key, value in update_data.items():
        setattr(user, key, value)
        
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_USER", 
        target=f"用户:{user.username}", 
        ip_address=ip,
        trace_id=trace_id
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
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="RESET_PASSWORD", 
        target=f"用户:{user.username}", 
        ip_address=ip,
        trace_id=trace_id
    )
    
    await db.commit()
    return {"message": f"Password for {user.username} has been reset"}
