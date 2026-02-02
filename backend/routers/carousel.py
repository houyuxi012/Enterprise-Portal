from fastapi import APIRouter, Depends, HTTPException, Request
from services.audit_service import AuditService
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
    # Check for 'admin' role or specific permission
    is_admin = False
    if hasattr(current_user, 'roles'):
        for r in current_user.roles:
            if r.code == 'admin':
                is_admin = True
                break
    
    if not is_admin:
         raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.execute(select(models.CarouselItem).order_by(models.CarouselItem.sort_order))
    return result.scalars().all()

@router.post("/", response_model=schemas.CarouselItem)
async def create_carousel_item(
    request: Request,
    item: schemas.CarouselItemCreate, 
    db: AsyncSession = Depends(database.get_db), 
    current_user: schemas.User = Depends(get_current_user)
):
    is_admin = False
    if hasattr(current_user, 'roles'):
        for r in current_user.roles:
            if r.code == 'admin':
                is_admin = True
                break
    if not is_admin:
         raise HTTPException(status_code=403, detail="Not authorized")
    
    db_item = models.CarouselItem(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_CAROUSEL_ITEM", 
        target=f"Carousel:{db_item.id} ({db_item.title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return db_item

@router.put("/{item_id}", response_model=schemas.CarouselItem)
async def update_carousel_item(
    request: Request,
    item_id: int, 
    item: schemas.CarouselItemUpdate, 
    db: AsyncSession = Depends(database.get_db), 
    current_user: schemas.User = Depends(get_current_user)
):
    is_admin = False
    if hasattr(current_user, 'roles'):
        for r in current_user.roles:
            if r.code == 'admin':
                is_admin = True
                break
    if not is_admin:
         raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await db.execute(select(models.CarouselItem).filter(models.CarouselItem.id == item_id))
    db_item = result.scalars().first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    for key, value in item.model_dump(exclude_unset=True).items():
        setattr(db_item, key, value)
        
    await db.commit()
    await db.refresh(db_item)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_CAROUSEL_ITEM", 
        target=f"Carousel:{db_item.id} ({db_item.title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return db_item

@router.delete("/{item_id}")
async def delete_carousel_item(
    request: Request,
    item_id: int, 
    db: AsyncSession = Depends(database.get_db), 
    current_user: schemas.User = Depends(get_current_user)
):
    if hasattr(current_user, 'role') and current_user.role != 'admin':
         raise HTTPException(status_code=403, detail="Not authorized")
        
    result = await db.execute(select(models.CarouselItem).filter(models.CarouselItem.id == item_id))
    db_item = result.scalars().first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    title = db_item.title
    await db.delete(db_item)
    await db.commit()
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_CAROUSEL_ITEM", 
        target=f"轮播图:{item_id} ({title})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    return {"ok": True}
