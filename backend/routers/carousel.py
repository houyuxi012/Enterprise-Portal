from fastapi import APIRouter, Depends, HTTPException, Request
from services.audit_service import AuditService
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import database
import models
import schemas
from iam.deps import PermissionChecker

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
async def get_all_carousel_items(
    db: AsyncSession = Depends(database.get_db), 
    _: models.User = Depends(PermissionChecker("portal.carousel.manage"))
):
    result = await db.execute(select(models.CarouselItem).order_by(models.CarouselItem.sort_order))
    return result.scalars().all()

@router.post("/", response_model=schemas.CarouselItem)
async def create_carousel_item(
    request: Request,
    item: schemas.CarouselItemCreate, 
    db: AsyncSession = Depends(database.get_db), 
    current_user: models.User = Depends(PermissionChecker("portal.carousel.manage"))
):
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
    current_user: models.User = Depends(PermissionChecker("portal.carousel.manage"))
):
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
    current_user: models.User = Depends(PermissionChecker("portal.carousel.manage"))
):
        
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
