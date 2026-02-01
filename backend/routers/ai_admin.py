from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, cast, Date
from typing import List, Optional
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
    
    # Foolproof check: Do not allow ciphertext or placeholders
    if plain_api_key.startswith("gAAAA") or "***" in plain_api_key or "placeholder" in plain_api_key.lower():
        raise HTTPException(status_code=400, detail="Invalid API Key format. Please provide a valid plaintext key.")

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
    
    # Logic to ensure single active provider REMOVED
    # Allow multiple active providers.
    pass

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
         input_key = provider.api_key
         # 1. Idempotency Check: exact match
         if input_key == db_provider.api_key:
             pass # No change
         
         # 2. Foolproof Check: Starts with Fernet prefix 'gAAAA'
         # If it starts with gAAAA, assume it's the existing ciphertext being returned by UI.
         # Do NOT re-encrypt. Do NOT update.
         elif input_key.startswith("gAAAA"):
             print(f"Ignored encrypted key update for Provider {id}")
             pass
             
         # 3. Foolproof Check: Masked chars or obvious placeholders
         elif "***" in input_key or "placeholder" in input_key.lower():
             print(f"Ignored masked/invalid key update for Provider {id}")
             pass
             
         else:
             # Plain text key (TLS) -> Encrypt
             db_provider.api_key = CryptoService.encrypt_data(input_key)
    if provider.model is not None:
         db_provider.model = provider.model
    if provider.is_active is not None:
         db_provider.is_active = provider.is_active
         
         # Enforce single active REMOVED
         pass
                 
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

    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_AI_POLICY", 
        target=f"AI策略:{db_policy.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

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

    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_AI_POLICY", 
        target=f"AI策略:{db_policy.name}", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

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



# --- Quota Management ---

from datetime import datetime, timedelta

@router.get("/usage", response_model=List[schemas.AIModelQuota])
async def get_usage_stats(
    hours: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    # 1. Get all quotas
    result = await db.execute(select(models.AIModelQuota))
    quotas = {q.model_name: q for q in result.scalars().all()}
    
    # 2. Get today's usage (Always relative to actual Today, regardless of filter, to show "Realtime")
    today = datetime.now().date()
    today_stats = await db.execute(
        select(models.AIAuditLog.model, func.sum(models.AIAuditLog.tokens_in + models.AIAuditLog.tokens_out))
        .where(cast(models.AIAuditLog.ts, Date) == today)
        .group_by(models.AIAuditLog.model)
    )
    today_map = {row[0]: row[1] or 0 for row in today_stats.all()}
    
    # Filter setup
    cutoff = None
    if hours:
        cutoff = datetime.now() - timedelta(hours=hours)

    # 3. Get Period Usage (Sum in range)
    period_query = select(
        models.AIAuditLog.model,
        func.sum(models.AIAuditLog.tokens_in + models.AIAuditLog.tokens_out)
    ).group_by(models.AIAuditLog.model)
    
    if cutoff:
        period_query = period_query.where(models.AIAuditLog.ts >= cutoff)
        
    period_stats = await db.execute(period_query)
    period_map = {row[0]: row[1] or 0 for row in period_stats.all()}

    # 4. Get Peak usage (grouped by day, model) - Filtered by Range
    history_query = select(
        models.AIAuditLog.model,
        cast(models.AIAuditLog.ts, Date).label("day"),
        func.sum(models.AIAuditLog.tokens_in + models.AIAuditLog.tokens_out).label("total")
    ).group_by(models.AIAuditLog.model, "day")

    if cutoff:
        history_query = history_query.where(models.AIAuditLog.ts >= cutoff)

    history_usage = await db.execute(history_query)
    
    peak_map = {}
    distinct_models = set()
    
    for row in history_usage.all():
        m = row[0]
        usage = row[2] or 0
        if m not in peak_map: peak_map[m] = 0
        if usage > peak_map[m]: peak_map[m] = usage
        distinct_models.add(m)

    # 5. Get active models from AIProvider
    providers_result = await db.execute(select(models.AIProvider.model))
    active_models_set = set([m for m in providers_result.scalars().all() if m])
    
    # Ensure all period models are in distinct_models so they appear
    for m in period_map.keys():
        distinct_models.add(m)
        
    # Merge with quotas
    final_list = []
    
    # Handle existing quotas
    for model_name, quota in quotas.items():
        q_out = schemas.AIModelQuota(
            id=quota.id,
            model_name=quota.model_name,
            daily_token_limit=quota.daily_token_limit,
            daily_request_limit=quota.daily_request_limit,
            updated_at=quota.updated_at,
            peak_daily_tokens=peak_map.get(model_name, 0),
            current_daily_tokens=today_map.get(model_name, 0),
            period_tokens=period_map.get(model_name, 0),
            is_active=(model_name in active_models_set)
        )
        final_list.append(q_out)
        if model_name in distinct_models:
             distinct_models.discard(model_name)
        
    # Handle discovered models without quota
    for m in distinct_models:
        if not m: continue
        final_list.append(schemas.AIModelQuota(
            id=0, # Virtual
            model_name=m,
            daily_token_limit=0,
            daily_request_limit=0,
            peak_daily_tokens=peak_map.get(m, 0),
            current_daily_tokens=today_map.get(m, 0),
            period_tokens=period_map.get(m, 0),
            is_active=(m in active_models_set)
        ))
        
    return final_list

@router.post("/quotas", response_model=schemas.AIModelQuota)
async def update_quota(
    quota: schemas.AIModelQuotaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Check if exists
    result = await db.execute(select(models.AIModelQuota).where(models.AIModelQuota.model_name == quota.model_name))
    db_quota = result.scalars().first()
    
    if db_quota:
        db_quota.daily_token_limit = quota.daily_token_limit
        db_quota.daily_request_limit = quota.daily_request_limit
        db_quota.updated_at = datetime.now()
    else:
        db_quota = models.AIModelQuota(
            model_name=quota.model_name,
            daily_token_limit=quota.daily_token_limit,
            daily_request_limit=quota.daily_request_limit,
            updated_at=datetime.now()
        )
        db.add(db_quota)
        
    await db.commit()
    await db.refresh(db_quota)
    return db_quota
