
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
    - source=all: Merge results from both, deduplicate by timestamp+operator+action
    """
    db_logs_map = {}  # key: normalized (timestamp_sec, operator, action, target) -> log dict
    loki_logs_map = {}
    
    def normalize_key(ts, op, act, target):
        """Normalize timestamp to second precision for dedup."""
        # Handle various timestamp formats: 2026-02-01 04:47:39 or 2026-02-01T04:47:39.123Z
        ts_str = str(ts).replace('T', ' ').split('.')[0][:19] if ts else ""
        return (ts_str, op or "", act or "", target or "")
    
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
            log_dict = {
                "id": log.id,
                "operator": log.operator,
                "action": log.action,
                "target": log.target,
                "ip_address": log.ip_address,
                "status": log.status,
                "detail": log.detail,
                "timestamp": log.timestamp,
                "source": "DB"
            }
            key = normalize_key(log.timestamp, log.operator, log.action, log.target)
            db_logs_map[key] = log_dict
    
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
                        import json
                        data = resp.json()
                        loki_id = 10000
                        for stream in data.get("data", {}).get("result", []):
                            for value in stream.get("values", []):
                                try:
                                    log_data = json.loads(value[1])
                                    ts = log_data.get("timestamp", "")
                                    op = log_data.get("username", "")
                                    act = log_data.get("action", "")
                                    target = log_data.get("target", "")
                                    log_dict = {
                                        "id": loki_id,
                                        "operator": op,
                                        "action": act,
                                        "target": target,
                                        "ip_address": log_data.get("ip_address", ""),
                                        "status": log_data.get("status", "SUCCESS"),
                                        "detail": log_data.get("detail", ""),
                                        "timestamp": ts,
                                        "source": "LOKI"
                                    }
                                    key = normalize_key(ts, op, act, target)
                                    loki_logs_map[key] = log_dict
                                    loki_id += 1
                                except json.JSONDecodeError:
                                    pass
            except Exception as e:
                import logging
                logging.warning(f"Loki query failed: {e}")
    
    # Merge and deduplicate
    if source == "all":
        results = []
        all_keys = set(db_logs_map.keys()) | set(loki_logs_map.keys())
        for key in all_keys:
            in_db = key in db_logs_map
            in_loki = key in loki_logs_map
            if in_db and in_loki:
                # Both sources have this log - merge
                merged = db_logs_map[key].copy()
                merged["source"] = "DB,LOKI"
                results.append(merged)
            elif in_db:
                results.append(db_logs_map[key])
            else:
                results.append(loki_logs_map[key])
        # Sort by timestamp desc
        results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    elif source == "db":
        results = list(db_logs_map.values())
    else:
        results = list(loki_logs_map.values())
    
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
    Uses LogRepository for unified abstraction.
    """
    from services.log_repository import get_log_repository, LogQuery
    
    repo = get_log_repository()
    if not repo:
        return []
    
    query = LogQuery(
        log_type="ACCESS",
        path=path,
        status_code=status_code,
        limit=limit
    )
    
    results = await repo.read(query)
    
    # Format for frontend
    return [
        {
            "id": idx + 1,
            "timestamp": log.get("timestamp", ""),
            "trace_id": log.get("trace_id", ""),
            "method": log.get("method", ""),
            "path": log.get("path", ""),
            "status_code": log.get("status_code", 0),
            "ip_address": log.get("ip_address", ""),
            "user_agent": log.get("user_agent", ""),
            "latency_ms": log.get("latency_ms", 0),
        }
        for idx, log in enumerate(results[:limit])
    ]


# --- AI Audit Logs ---

@router.get("/ai-audit", response_model=List[schemas.AIAuditLog])
async def read_ai_audit_logs(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    actor_id: Optional[int] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    status: Optional[str] = None,
    source: str = Query("db", description="Log source: db, loki, or all"),
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Query AI audit logs from specified source.
    - source=db: Query from PostgreSQL (default)
    - source=loki: Query from Loki
    - source=all: Merge results from both, deduplicate by event_id
    """
    db_logs_map = {}  # key: event_id -> log dict
    loki_logs_map = {}
    
    # Query from DB
    if source in ("db", "all"):
        query = select(models.AIAuditLog).order_by(desc(models.AIAuditLog.ts))
        
        if start_time:
            try:
                start_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                query = query.filter(models.AIAuditLog.ts >= start_dt)
            except ValueError:
                pass
        
        if end_time:
            try:
                end_dt = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                query = query.filter(models.AIAuditLog.ts <= end_dt)
            except ValueError:
                pass
        
        if actor_id:
            query = query.filter(models.AIAuditLog.actor_id == actor_id)
        if provider:
            query = query.filter(models.AIAuditLog.provider == provider)
        if model:
            query = query.filter(models.AIAuditLog.model.contains(model))
        if status:
            query = query.filter(models.AIAuditLog.status == status)
        
        db_result = await db.execute(query.limit(limit).offset(offset))
        db_logs = db_result.scalars().all()
        for log in db_logs:
            db_logs_map[log.event_id] = log
    
    # Query from Loki (if enabled)
    if source in ("loki", "all"):
        import os
        import httpx
        loki_url = os.getenv("LOKI_PUSH_URL", "http://loki:3100")
        if loki_url:
            try:
                async with httpx.AsyncClient() as client:
                    query_str = '{job="enterprise-portal",source="ai_audit"}'
                    resp = await client.get(
                        f"{loki_url}/loki/api/v1/query_range",
                        params={"query": query_str, "limit": limit},
                        timeout=5.0
                    )
                    if resp.status_code == 200:
                        import json
                        data = resp.json()
                        loki_id = 100000
                        for stream in data.get("data", {}).get("result", []):
                            for value in stream.get("values", []):
                                try:
                                    log_data = json.loads(value[1])
                                    event_id = log_data.get("event_id", "")
                                    log_dict = {
                                        "id": loki_id,
                                        "event_id": event_id,
                                        "ts": log_data.get("timestamp", datetime.datetime.now().isoformat()),
                                        "actor_type": log_data.get("actor_type", "user"),
                                        "actor_id": log_data.get("actor_id"),
                                        "actor_ip": log_data.get("actor_ip"),
                                        "action": log_data.get("action", "CHAT"),
                                        "provider": log_data.get("provider"),
                                        "model": log_data.get("model"),
                                        "status": log_data.get("status", "SUCCESS"),
                                        "latency_ms": log_data.get("latency_ms"),
                                        "tokens_in": log_data.get("tokens_in"),
                                        "tokens_out": log_data.get("tokens_out"),
                                        "source": "loki"
                                    }
                                    loki_logs_map[event_id] = log_dict
                                    loki_id += 1
                                except json.JSONDecodeError:
                                    pass
            except Exception as e:
                import logging
                logging.warning(f"Loki AI audit query failed: {e}")
    
    # Merge and deduplicate
    if source == "all":
        results = []
        all_keys = set(db_logs_map.keys()) | set(loki_logs_map.keys())
        for key in all_keys:
            in_db = key in db_logs_map
            in_loki = key in loki_logs_map
            if in_db and in_loki:
                # Both sources have this log - use DB log with merged source
                log = db_logs_map[key]
                log_dict = {
                    "id": log.id,
                    "event_id": log.event_id,
                    "ts": log.ts,
                    "actor_type": log.actor_type,
                    "actor_id": log.actor_id,
                    "actor_ip": log.actor_ip,
                    "action": log.action,
                    "provider": log.provider,
                    "model": log.model,
                    "status": log.status,
                    "latency_ms": log.latency_ms,
                    "tokens_in": log.tokens_in,
                    "tokens_out": log.tokens_out,
                    "input_policy_result": log.input_policy_result,
                    "output_policy_result": log.output_policy_result,
                    "policy_hits": log.policy_hits,
                    "prompt_hash": log.prompt_hash,
                    "output_hash": log.output_hash,
                    "prompt_preview": log.prompt_preview,
                    "error_code": log.error_code,
                    "error_reason": log.error_reason,
                    "source": "db,loki"
                }
                results.append(log_dict)
            elif in_db:
                log = db_logs_map[key]
                log_dict = {
                    "id": log.id,
                    "event_id": log.event_id,
                    "ts": log.ts,
                    "actor_type": log.actor_type,
                    "actor_id": log.actor_id,
                    "actor_ip": log.actor_ip,
                    "action": log.action,
                    "provider": log.provider,
                    "model": log.model,
                    "status": log.status,
                    "latency_ms": log.latency_ms,
                    "tokens_in": log.tokens_in,
                    "tokens_out": log.tokens_out,
                    "input_policy_result": log.input_policy_result,
                    "output_policy_result": log.output_policy_result,
                    "policy_hits": log.policy_hits,
                    "prompt_hash": log.prompt_hash,
                    "output_hash": log.output_hash,
                    "prompt_preview": log.prompt_preview,
                    "error_code": log.error_code,
                    "error_reason": log.error_reason,
                    "source": "db"
                }
                results.append(log_dict)
            else:
                results.append(loki_logs_map[key])
        # Sort by ts desc
        results.sort(key=lambda x: getattr(x, 'ts', None) or x.get("ts", ""), reverse=True)
    elif source == "db":
        # Convert ORM objects to dicts with source field
        results = []
        for log in db_logs_map.values():
            log_dict = {
                "id": log.id,
                "event_id": log.event_id,
                "ts": log.ts,
                "actor_type": log.actor_type,
                "actor_id": log.actor_id,
                "actor_ip": log.actor_ip,
                "action": log.action,
                "provider": log.provider,
                "model": log.model,
                "status": log.status,
                "latency_ms": log.latency_ms,
                "tokens_in": log.tokens_in,
                "tokens_out": log.tokens_out,
                "input_policy_result": log.input_policy_result,
                "output_policy_result": log.output_policy_result,
                "policy_hits": log.policy_hits,
                "prompt_hash": log.prompt_hash,
                "output_hash": log.output_hash,
                "prompt_preview": log.prompt_preview,
                "error_code": log.error_code,
                "error_reason": log.error_reason,
                "source": "db"
            }
            results.append(log_dict)
    else:
        results = list(loki_logs_map.values())
    
    return results[:limit]




@router.get("/ai-audit/{event_id}", response_model=schemas.AIAuditLog)
async def get_ai_audit_detail(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get detailed AI audit log by event_id"""
    result = await db.execute(
        select(models.AIAuditLog).filter(models.AIAuditLog.event_id == event_id)
    )
    log = result.scalars().first()
    if not log:
        raise HTTPException(status_code=404, detail="AI audit log not found")
    return log


@router.get("/ai-audit/stats/summary")
async def get_ai_audit_stats(
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get AI audit statistics summary"""
    from sqlalchemy import func
    
    cutoff = datetime.datetime.now() - datetime.timedelta(days=days)
    
    # Total requests
    total_result = await db.execute(
        select(func.count(models.AIAuditLog.id)).filter(models.AIAuditLog.ts >= cutoff)
    )
    total = total_result.scalar() or 0
    
    # Success rate
    success_result = await db.execute(
        select(func.count(models.AIAuditLog.id)).filter(
            models.AIAuditLog.ts >= cutoff,
            models.AIAuditLog.status == "SUCCESS"
        )
    )
    success_count = success_result.scalar() or 0
    
    # Blocked count
    blocked_result = await db.execute(
        select(func.count(models.AIAuditLog.id)).filter(
            models.AIAuditLog.ts >= cutoff,
            models.AIAuditLog.status == "BLOCKED"
        )
    )
    blocked_count = blocked_result.scalar() or 0
    
    # Average latency
    latency_result = await db.execute(
        select(func.avg(models.AIAuditLog.latency_ms)).filter(
            models.AIAuditLog.ts >= cutoff,
            models.AIAuditLog.latency_ms.isnot(None)
        )
    )
    avg_latency = latency_result.scalar() or 0
    
    # Total tokens
    tokens_result = await db.execute(
        select(
            func.sum(models.AIAuditLog.tokens_in),
            func.sum(models.AIAuditLog.tokens_out)
        ).filter(models.AIAuditLog.ts >= cutoff)
    )
    tokens_row = tokens_result.first()
    total_tokens_in = tokens_row[0] or 0 if tokens_row else 0
    total_tokens_out = tokens_row[1] or 0 if tokens_row else 0
    
    # Per-model token usage breakdown
    model_stats_result = await db.execute(
        select(
            models.AIAuditLog.model,
            func.count(models.AIAuditLog.id).label("requests"),
            func.sum(models.AIAuditLog.tokens_in).label("tokens_in"),
            func.sum(models.AIAuditLog.tokens_out).label("tokens_out")
        ).filter(
            models.AIAuditLog.ts >= cutoff
        ).group_by(
            models.AIAuditLog.model
        ).order_by(
            func.sum(models.AIAuditLog.tokens_in + models.AIAuditLog.tokens_out).desc()
        ).limit(50)
    )
    model_stats_rows = model_stats_result.fetchall()
    model_breakdown = [
        {
            "model": row[0] or "unknown",
            "requests": row[1] or 0,
            "tokens_in": row[2] or 0,
            "tokens_out": row[3] or 0,
            "total_tokens": (row[2] or 0) + (row[3] or 0)
        }
        for row in model_stats_rows
    ]
    
    return {
        "period_days": days,
        "total_requests": total,
        "success_count": success_count,
        "blocked_count": blocked_count,
        "error_count": total - success_count - blocked_count,
        "success_rate": round(success_count / total * 100, 2) if total > 0 else 0,
        "avg_latency_ms": round(avg_latency, 2),
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "total_tokens": total_tokens_in + total_tokens_out,
        "model_breakdown": model_breakdown
    }

