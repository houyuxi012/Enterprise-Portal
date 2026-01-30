from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from datetime import datetime

from database import get_db
import models
import schemas
from routers.auth import get_current_user

router = APIRouter(
    prefix="/ai/admin",
    tags=["ai-admin"],
    dependencies=[Depends(get_current_user)] # Ideally check for admin role
)

# --- Providers Management ---

@router.get("/providers", response_model=List[schemas.AIProvider])
async def get_providers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.AIProvider).order_by(models.AIProvider.created_at))
    return result.scalars().all()

@router.post("/providers", response_model=schemas.AIProvider)
async def create_provider(provider: schemas.AIProviderCreate, db: AsyncSession = Depends(get_db)):
    # Check duplicate name
    existing = await db.execute(select(models.AIProvider).where(models.AIProvider.name == provider.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Provider name already exists")
    
    # If setting active, deactivate others (optional preference: ensure only one active?)
    if provider.is_active:
         await db.execute(select(models.AIProvider).where(models.AIProvider.is_active == True))
         # We might want to allow multiple? For now let's assume one main active provider for simplicity in Chat
         # Update all others to false
         # Implementation: Deactivate all others if this one is active
         # (Skipping complex logic for MVP, user can manage manually)
         pass

    db_provider = models.AIProvider(
        **provider.dict(),
        created_at=datetime.now()
    )
    db.add(db_provider)
    await db.commit()
    await db.refresh(db_provider)
    
    # Logic to ensure single active provder
    if provider.is_active:
        # Set all other providers to inactive
        stmt = select(models.AIProvider).where(models.AIProvider.id != db_provider.id)
        others_result = await db.execute(stmt)
        others = others_result.scalars().all()
        for o in others:
            o.is_active = False
        await db.commit()

    return db_provider

@router.put("/providers/{id}", response_model=schemas.AIProvider)
async def update_provider(id: int, provider: schemas.AIProviderUpdate, db: AsyncSession = Depends(get_db)):
    db_provider = await db.get(models.AIProvider, id)
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    if provider.name is not None:
         db_provider.name = provider.name
    if provider.type is not None:
         db_provider.type = provider.type
    if provider.base_url is not None:
         db_provider.base_url = provider.base_url
    if provider.api_key is not None:
         db_provider.api_key = provider.api_key
    if provider.model is not None:
         db_provider.model = provider.model
    if provider.is_active is not None:
         db_provider.is_active = provider.is_active
         
         # Enforce single active
         if provider.is_active:
             stmt = select(models.AIProvider).where(models.AIProvider.id != id)
             others_result = await db.execute(stmt)
             others = others_result.scalars().all()
             for o in others:
                 o.is_active = False
                 
    await db.commit()
    await db.refresh(db_provider)
    return db_provider

@router.delete("/providers/{id}")
async def delete_provider(id: int, db: AsyncSession = Depends(get_db)):
    db_provider = await db.get(models.AIProvider, id)
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.delete(db_provider)
    await db.commit()
    return {"message": "Provider deleted"}


# --- Policy Management ---

@router.get("/policies", response_model=List[schemas.AISecurityPolicy])
async def get_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.AISecurityPolicy).order_by(models.AISecurityPolicy.created_at))
    return result.scalars().all()

@router.post("/policies", response_model=schemas.AISecurityPolicy)
async def create_policy(policy: schemas.AISecurityPolicyCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(models.AISecurityPolicy).where(models.AISecurityPolicy.name == policy.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Policy name already exists")
        
    db_policy = models.AISecurityPolicy(
        **policy.dict(),
        created_at=datetime.now()
    )
    db.add(db_policy)
    await db.commit()
    await db.refresh(db_policy)
    return db_policy

@router.put("/policies/{id}", response_model=schemas.AISecurityPolicy)
async def update_policy(id: int, policy: schemas.AISecurityPolicyUpdate, db: AsyncSession = Depends(get_db)):
    db_policy = await db.get(models.AISecurityPolicy, id)
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
        
    for var, value in vars(policy).items():
        if value is not None:
            setattr(db_policy, var, value)
            
    await db.commit()
    await db.refresh(db_policy)
    return db_policy

@router.delete("/policies/{id}")
async def delete_policy(id: int, db: AsyncSession = Depends(get_db)):
    db_policy = await db.get(models.AISecurityPolicy, id)
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await db.delete(db_policy)
    await db.commit()
    return {"message": "Policy deleted"}
