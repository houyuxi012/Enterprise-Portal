from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from datetime import datetime

from database import get_db
import models
import schemas
from routers.auth import get_current_user
from fastapi import Request
import uuid
from services.audit_service import AuditService
from services.crypto_service import CryptoService

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
async def create_provider(
    request: Request,
    provider: schemas.AIProviderCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
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

    # API Key is sent as plain text (TLS protected)
    plain_api_key = provider.api_key 

    encrypted_api_key = CryptoService.encrypt_data(plain_api_key)
    
    # Update dict with encrypted key
    provider_data = provider.dict()
    provider_data['api_key'] = encrypted_api_key

    db_provider = models.AIProvider(
        **provider_data,
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

    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_AI_PROVIDER", 
        target=f"AI供应商:{db_provider.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return db_provider

@router.put("/providers/{id}", response_model=schemas.AIProvider)
async def update_provider(
    id: int, 
    request: Request,
    provider: schemas.AIProviderUpdate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
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
         # Plain text key (TLS)
         plain_key = provider.api_key
         # Encrypt AES for storage
         db_provider.api_key = CryptoService.encrypt_data(plain_key)
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
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_AI_PROVIDER", 
        target=f"AI供应商:{db_provider.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    return db_provider

@router.delete("/providers/{id}")
async def delete_provider(
    id: int, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_provider = await db.get(models.AIProvider, id)
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.delete(db_provider)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_AI_PROVIDER", 
        target=f"AI供应商:{db_provider.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit() # Audit needs commit but provider already deleted in session. 
    # Actually `db.delete` just marks for deletion. The commit handles both.
    # But wait, lines above say `await db.commit()` then return message.
    # I should insert audit logging BEFORE the commit for deletion, OR do a second commit.
    # Since I replaced lines 97-99, `await db.commit()` is inside my ReplacementContent.
    
    return {"message": "Provider deleted"}


# --- Policy Management ---

@router.get("/policies", response_model=List[schemas.AISecurityPolicy])
async def get_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.AISecurityPolicy).order_by(models.AISecurityPolicy.created_at))
    return result.scalars().all()

@router.post("/policies", response_model=schemas.AISecurityPolicy)
async def create_policy(
    request: Request,
    policy: schemas.AISecurityPolicyCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
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
async def update_policy(
    id: int, 
    request: Request,
    policy: schemas.AISecurityPolicyUpdate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
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
async def delete_policy(
    id: int, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_policy = await db.get(models.AISecurityPolicy, id)
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await db.delete(db_policy)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_AI_POLICY", 
        target=f"AI策略:{db_policy.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    return {"message": "Policy deleted"}
