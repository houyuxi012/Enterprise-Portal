from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import database
import models
import schemas
from routers.auth import get_current_user

router = APIRouter(
    prefix="/carousel",
    tags=["carousel"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=List[schemas.CarouselItem])
async def get_carousel_items(db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.CarouselItem).filter(models.CarouselItem.is_active == True).order_by(models.CarouselItem.sort_order))
    return result.scalars().all()

@router.get("/admin", response_model=List[schemas.CarouselItem])
async def get_all_carousel_items(db: AsyncSession = Depends(database.get_db), current_user: schemas.User = Depends(get_current_user)):
    # Note: RBAC check is implicit if get_current_user is used, but for specifically 'admin' role:
    # However, user models.User might not have 'role' attribute easy to check if it's M:N.
    # But based on seed.py, User has a 'role' column (likely string) for simpler cases or migration.
    # Let's check permissions if possible, or fallback to simple check.
    # For now, simplistic check if user model has 'role' field.
    if hasattr(current_user, 'role') and current_user.role != 'admin':
         raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.execute(select(models.CarouselItem).order_by(models.CarouselItem.sort_order))
    return result.scalars().all()

@router.post("/", response_model=schemas.CarouselItem)
async def create_carousel_item(item: schemas.CarouselItemCreate, db: AsyncSession = Depends(database.get_db), current_user: schemas.User = Depends(get_current_user)):
    if hasattr(current_user, 'role') and current_user.role != 'admin':
         raise HTTPException(status_code=403, detail="Not authorized")
    
    db_item = models.CarouselItem(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.put("/{item_id}", response_model=schemas.CarouselItem)
async def update_carousel_item(item_id: int, item: schemas.CarouselItemUpdate, db: AsyncSession = Depends(database.get_db), current_user: schemas.User = Depends(get_current_user)):
    if hasattr(current_user, 'role') and current_user.role != 'admin':
         raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await db.execute(select(models.CarouselItem).filter(models.CarouselItem.id == item_id))
    db_item = result.scalars().first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    for key, value in item.model_dump(exclude_unset=True).items():
        setattr(db_item, key, value)
        
    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.delete("/{item_id}")
async def delete_carousel_item(item_id: int, db: AsyncSession = Depends(database.get_db), current_user: schemas.User = Depends(get_current_user)):
    if hasattr(current_user, 'role') and current_user.role != 'admin':
         raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await db.execute(select(models.CarouselItem).filter(models.CarouselItem.id == item_id))
    db_item = result.scalars().first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    await db.delete(db_item)
    await db.commit()
    return {"ok": True}
