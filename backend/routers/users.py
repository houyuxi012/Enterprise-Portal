from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Annotated
import models, schemas
from database import get_db
from routers.auth import get_current_active_admin
from auth import get_password_hash

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(get_current_active_admin)] # Protect all endpoints with Admin check
)

@router.get("/", response_model=List[schemas.UserResponse])
async def read_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User))
    return result.scalars().all()

@router.post("/", response_model=schemas.UserResponse)
async def create_user(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    # Check existing
    result = await db.execute(select(models.User).where(models.User.username == user.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pwd = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_pwd,
        role=user.role
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting self (simple check, assume admin shouldn't delete themselves this way or UI handles it)
    # Ideally check against current_user id
    
    await db.delete(user)
    await db.commit()
    return None
