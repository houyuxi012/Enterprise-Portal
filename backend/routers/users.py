from fastapi import APIRouter, Depends, HTTPException, status
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

@router.get("/roles", response_model=List[schemas.Role], dependencies=[Depends(PermissionChecker("sys:user:view"))])
async def read_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Role))
    return result.scalars().all()

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
async def create_user(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(models.User).filter(models.User.username == user.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
        
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
    # Re-fetch with roles loaded
    result = await db.execute(select(models.User).options(selectinload(models.User.roles).selectinload(models.Role.permissions)).filter(models.User.id == db_user.id))
    return result.scalars().first()

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
     result = await db.execute(select(models.User).filter(models.User.id == user_id))
     user = result.scalars().first()
     if not user:
         raise HTTPException(status_code=404, detail="User not found")
         
     await db.delete(user)
     await db.commit()

@router.put("/{user_id}", response_model=schemas.User, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def update_user(user_id: int, user_update: schemas.UserUpdate, db: AsyncSession = Depends(get_db)):
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
             
    for key, value in update_data.items():
        setattr(user, key, value)
        
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/reset-password", status_code=status.HTTP_200_OK, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def reset_password(request: schemas.PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).filter(models.User.username == request.username))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Reset password
    new_pwd = request.new_password if request.new_password else "123456"
    user.hashed_password = utils.get_password_hash(new_pwd)
    
    await db.commit()
    return {"message": f"Password for {user.username} has been reset"}
