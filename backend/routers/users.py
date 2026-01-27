from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models, schemas, utils
from sqlalchemy import select
from routers.auth import get_current_user

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.get("/", response_model=List[schemas.User])
async def read_users(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Ensure only admin can list users?
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.execute(select(models.User))
    return result.scalars().all()

@router.post("/", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
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
        role=user.role,
        is_active=user.is_active
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(get_current_user)):
     if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
     
     result = await db.execute(select(models.User).filter(models.User.id == user_id))
     user = result.scalars().first()
     if not user:
         raise HTTPException(status_code=404, detail="User not found")
         
     await db.delete(user)
     await db.commit()
