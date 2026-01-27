from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import models, schemas
from database import get_db
from dependencies import PermissionChecker

router = APIRouter(
    prefix="/roles",
    tags=["roles"]
)

@router.get("/", response_model=List[schemas.Role], dependencies=[Depends(PermissionChecker("sys:user:view"))])
async def read_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Role).options(selectinload(models.Role.permissions)))
    return result.scalars().all()

@router.get("/permissions", response_model=List[schemas.Permission], dependencies=[Depends(PermissionChecker("sys:user:view"))])
async def read_permissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Permission))
    return result.scalars().all()

@router.post("/", response_model=schemas.Role, status_code=status.HTTP_201_CREATED, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def create_role(role: schemas.RoleCreate, db: AsyncSession = Depends(get_db)):
    # Check code uniqueness
    result = await db.execute(select(models.Role).filter(models.Role.code == role.code))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Role code already exists")

    db_role = models.Role(
        code=role.code,
        name=role.name,
        # description not in model
    )
    
    # Assign permissions
    if role.permission_ids:
        perm_result = await db.execute(select(models.Permission).filter(models.Permission.id.in_(role.permission_ids)))
        perms = perm_result.scalars().all()
        db_role.permissions = perms
    
    db.add(db_role)
    await db.commit()
    await db.refresh(db_role)
    
    # Reload with permissions for response
    result = await db.execute(select(models.Role).options(selectinload(models.Role.permissions)).filter(models.Role.id == db_role.id))
    return result.scalars().first()

@router.put("/{role_id}", response_model=schemas.Role, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def update_role(role_id: int, role_update: schemas.RoleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Role).options(selectinload(models.Role.permissions)).filter(models.Role.id == role_id))
    db_role = result.scalars().first()
    
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    if role_update.name is not None:
        db_role.name = role_update.name
        
    if role_update.permission_ids is not None:
        perm_result = await db.execute(select(models.Permission).filter(models.Permission.id.in_(role_update.permission_ids)))
        perms = perm_result.scalars().all()
        db_role.permissions = perms
        
    await db.commit()
    await db.refresh(db_role)
    return db_role

@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(PermissionChecker("sys:user:edit"))])
async def delete_role(role_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Role).filter(models.Role.id == role_id))
    db_role = result.scalars().first()
    
    if not db_role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    # Prevent deleting admin or critical roles if needed?
    if db_role.code == 'admin':
        raise HTTPException(status_code=400, detail="Cannot delete admin role")
        
    await db.delete(db_role)
    await db.commit()
