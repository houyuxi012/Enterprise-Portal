
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
import models
import schemas
from database import get_db
from routers.auth import get_current_user
import datetime

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    responses={404: {"description": "Not found"}},
)

# --- System Logs ---

@router.get("/system", response_model=List[schemas.SystemLog])
async def read_system_logs(
    level: Optional[str] = None,
    module: Optional[str] = None,
    exclude_module: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = select(models.SystemLog).order_by(desc(models.SystemLog.id))
    if level:
        query = query.filter(models.SystemLog.level == level)
    if module:
        query = query.filter(models.SystemLog.module == module)
    if exclude_module:
        query = query.filter(models.SystemLog.module != exclude_module)
    
    result = await db.execute(query.limit(limit).offset(offset))
    return result.scalars().all()

# --- Business Logs ---

@router.get("/business", response_model=List[schemas.BusinessLog])
async def read_business_logs(
    operator: Optional[str] = None,
    action: Optional[str] = None,
    source: Optional[str] = Query("db", description="Log source: db, loki, or all"),
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Query business logs from specified source.
    - source=db: Query from PostgreSQL (default)
    - source=loki: Query from Loki
    - source=all: Merge results from both (DB first, then Loki)
    """
    results = []
    
    # Query from DB
    if source in ("db", "all"):
        query = select(models.BusinessLog).order_by(desc(models.BusinessLog.id))
        if operator:
            query = query.filter(models.BusinessLog.operator.contains(operator))
        if action:
            query = query.filter(models.BusinessLog.action == action)
        
        db_result = await db.execute(query.limit(limit).offset(offset))
        db_logs = db_result.scalars().all()
        for log in db_logs:
            results.append({
                "id": log.id,
                "operator": log.operator,
                "action": log.action,
                "target": log.target,
                "ip_address": log.ip_address,
                "status": log.status,
                "detail": log.detail,
                "timestamp": log.timestamp,
                "source": log.source or "DB"
            })
    
    # Query from Loki
    if source in ("loki", "all"):
        import os
        import httpx
        loki_url = os.getenv("LOKI_PUSH_URL")
        if loki_url:
            try:
                async with httpx.AsyncClient() as client:
                    query_str = '{job="enterprise-portal",log_type="BUSINESS"}'
                    resp = await client.get(
                        f"{loki_url}/loki/api/v1/query_range",
                        params={"query": query_str, "limit": limit},
                        timeout=5.0
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for stream in data.get("data", {}).get("result", []):
                            for value in stream.get("values", []):
                                import json
                                try:
                                    log_data = json.loads(value[1])
                                    results.append({
                                        "id": len(results) + 10000,  # Loki logs get high IDs
                                        "operator": log_data.get("username", ""),
                                        "action": log_data.get("action", ""),
                                        "target": log_data.get("target", ""),
                                        "ip_address": log_data.get("ip_address", ""),
                                        "status": log_data.get("status", "SUCCESS"),
                                        "detail": log_data.get("detail", ""),
                                        "timestamp": log_data.get("timestamp", ""),
                                        "source": "LOKI"
                                    })
                                except json.JSONDecodeError:
                                    pass
            except Exception as e:
                import logging
                logging.warning(f"Loki query failed: {e}")
    
    return results[:limit]

@router.post("/business", response_model=schemas.BusinessLog)
async def create_business_log(
    log: schemas.BusinessLogCreate,
    db: AsyncSession = Depends(get_db),
    # Allowing internal calls or authenticated users to log actions
    current_user: models.User = Depends(get_current_user) 
):
    db_log = models.BusinessLog(**log.dict())
    db.add(db_log)
    await db.commit()
    await db.refresh(db_log)
    return db_log

# --- Log Forwarding ---

@router.get("/config", response_model=List[schemas.LogForwardingConfig])
async def read_log_configs(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.LogForwardingConfig))
    return result.scalars().all()

@router.post("/config", response_model=schemas.LogForwardingConfig)
async def create_log_config(
    config: schemas.LogForwardingConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_config = models.LogForwardingConfig(**config.dict())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.delete("/config/{config_id}")
async def delete_log_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.LogForwardingConfig).filter(models.LogForwardingConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    await db.delete(db_config)
    await db.commit()
    return {"message": "Config deleted"}

# --- Access Logs (Loki Only) ---

@router.get("/access")
async def read_access_logs(
    path: Optional[str] = None,
    status_code: Optional[int] = None,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user)
):
    """
    Query access logs from Loki only.
    Access logs are NOT stored in the database.
    """
    import os
    import httpx
    import json
    
    loki_url = os.getenv("LOKI_PUSH_URL")
    if not loki_url:
        return []
    
    results = []
    try:
        async with httpx.AsyncClient() as client:
            query_str = '{job="enterprise-portal",log_type="ACCESS"}'
            resp = await client.get(
                f"{loki_url}/loki/api/v1/query_range",
                params={"query": query_str, "limit": limit},
                timeout=5.0
            )
            if resp.status_code == 200:
                data = resp.json()
                for stream in data.get("data", {}).get("result", []):
                    for value in stream.get("values", []):
                        try:
                            log_data = json.loads(value[1])
                            # Apply filters
                            if path and path not in log_data.get("path", ""):
                                continue
                            if status_code and log_data.get("status_code") != status_code:
                                continue
                            
                            results.append({
                                "id": len(results) + 1,
                                "timestamp": log_data.get("timestamp", ""),
                                "trace_id": log_data.get("trace_id", ""),
                                "method": log_data.get("method", ""),
                                "path": log_data.get("path", ""),
                                "status_code": log_data.get("status_code", 0),
                                "ip_address": log_data.get("ip_address", ""),
                                "user_agent": log_data.get("user_agent", ""),
                                "latency_ms": log_data.get("latency_ms", 0),
                            })
                        except json.JSONDecodeError:
                            pass
    except Exception as e:
        import logging
        logging.warning(f"Loki access log query failed: {e}")
    
    return results[:limit]
