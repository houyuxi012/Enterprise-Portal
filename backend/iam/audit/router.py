"""
IAM Audit Router - IAM 审计日志查询路由
/iam/admin/audit-logs
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from iam.deps import get_db, PermissionChecker
from .models import IAMAuditLog

router = APIRouter(prefix="/audit", tags=["iam-audit"])


from typing import Optional, List, Dict, Any

class AuditLogResponse(BaseModel):
    id: int
    timestamp: datetime
    user_id: Optional[int]
    username: Optional[str]
    action: str
    target_type: str
    target_id: Optional[int]
    target_name: Optional[str]
    detail: Optional[Any] # Changed from Dict to Any to support Lists/Primitives in JSON
    ip_address: Optional[str]
    result: Optional[str]     # Changed from success: int to result: str
    reason: Optional[str]     # Added reason
    trace_id: Optional[str]   # Added trace_id
    source: Optional[str] = "DB"  # Data source: DB or Loki
    
    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int


@router.get("/logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    action: Optional[str] = None,
    username: Optional[str] = None,
    target_type: Optional[str] = None,
    result: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    source: str = Query("db", regex="^(db|loki|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("sys:settings:view"))
):
    """查询 IAM 审计日志 - 支持 DB/Loki 来源选择 (业务日志模式)"""
    import os
    import httpx
    import json
    from datetime import timezone
    
    db_logs_map = {}
    loki_logs_map = {}
    
    # Helper: convert timestamp to epoch_ms for sorting
    def to_epoch_ms(ts) -> int:
        if not ts:
            return 0
        try:
            if isinstance(ts, datetime):
                return int(ts.timestamp() * 1000)
            s = str(ts).replace("T", " ").replace("Z", "")
            dt = datetime.fromisoformat(s)
            return int(dt.timestamp() * 1000)
        except Exception:
            return 0
    
    # Helper: normalize key for deduplication
    # Use minute-level precision (YYYY-MM-DD HH:MM) to merge DB and Loki records
    def normalize_key(ts, uname, act, target):
        if ts is None:
            ts_str = ""
        elif isinstance(ts, datetime):
            # Convert datetime to ISO string first
            ts_str = ts.strftime("%Y-%m-%d %H:%M")
        else:
            # String: normalize T to space, then take first 16 chars (YYYY-MM-DD HH:MM)
            ts_str = str(ts).replace('T', ' ')[:16]
        return (ts_str, uname or "", act or "", target or "")
    
    # Strategy: Fetch (page_size * page) from BOTH sources to ensure we cover the window
    # Then merge, sort globally, and slice for pagination
    offset = (page - 1) * page_size
    fetch_limit = page_size + offset
    
    # Query from DB
    if source in ("db", "all"):
        query = select(IAMAuditLog).order_by(desc(IAMAuditLog.timestamp))
        
        if action:
            query = query.filter(IAMAuditLog.action == action)
        if username:
            query = query.filter(IAMAuditLog.username.ilike(f"%{username}%"))
        if target_type:
            query = query.filter(IAMAuditLog.target_type == target_type)
        if result:
            query = query.filter(IAMAuditLog.result == result)
        if start_time:
            query = query.filter(IAMAuditLog.timestamp >= start_time)
        if end_time:
            query = query.filter(IAMAuditLog.timestamp <= end_time)
        
        # Fetch enough data for merge
        db_result = await db.execute(query.limit(fetch_limit))
        db_items = db_result.scalars().all()
        
        for item in db_items:
            log_dict = {
                "id": item.id,
                "timestamp": item.timestamp,
                "user_id": item.user_id,
                "username": item.username,
                "action": item.action,
                "target_type": item.target_type,
                "target_id": item.target_id,
                "target_name": item.target_name,
                "detail": item.detail,
                "ip_address": item.ip_address,
                "result": item.result,
                "reason": item.reason,
                "trace_id": item.trace_id,
                "source": "DB",
                "_epoch": to_epoch_ms(item.timestamp)
            }
            key = normalize_key(item.timestamp, item.username, item.action, item.target_name)
            db_logs_map[key] = log_dict
    
    # Query from Loki
    if source in ("loki", "all"):
        try:
            loki_url = os.getenv("LOKI_PUSH_URL", "http://loki:3100")
            
            # Build LogQL query
            label_filters = ['job="enterprise-portal"', 'log_type="IAM"']
            logql = '{' + ','.join(label_filters) + '}'
            
            # Time range
            now = datetime.now(timezone.utc)
            end_ts = end_time if end_time else now
            start_ts = start_time if start_time else now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            params = {
                "query": logql,
                "start": start_ts.isoformat(),
                "end": end_ts.isoformat(),
                "limit": fetch_limit
            }
            
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{loki_url}/loki/api/v1/query_range", params=params, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    loki_id = 100000
                    for stream in data.get("data", {}).get("result", []):
                        for value in stream.get("values", []):
                            try:
                                log_line = json.loads(value[1])
                                
                                # Apply filters
                                if action and log_line.get("action") != action:
                                    continue
                                if username and username.lower() not in (log_line.get("username") or "").lower():
                                    continue
                                if result and log_line.get("result") != result:
                                    continue
                                
                                ts = log_line.get("timestamp", now.isoformat())
                                log_dict = {
                                    "id": loki_id,
                                    "timestamp": datetime.fromisoformat(ts) if isinstance(ts, str) else ts,
                                    "user_id": log_line.get("user_id"),
                                    "username": log_line.get("username"),
                                    "action": log_line.get("action", ""),
                                    "target_type": log_line.get("target_type", ""),
                                    "target_id": log_line.get("target_id"),
                                    "target_name": log_line.get("target_name"),
                                    "detail": log_line.get("detail"),
                                    "ip_address": log_line.get("ip_address"),
                                    "result": log_line.get("result"),
                                    "reason": log_line.get("reason"),
                                    "trace_id": log_line.get("trace_id"),
                                    "source": "Loki",
                                    "_epoch": to_epoch_ms(ts)
                                }
                                key = normalize_key(ts, log_line.get("username"), log_line.get("action"), log_line.get("target_name"))
                                loki_logs_map[key] = log_dict
                                loki_id += 1
                            except Exception:
                                continue
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to query Loki for IAM audit: {e}")
    
    # Merge and deduplicate (DB priority, with merge indicator)
    results = []
    if source == "all":
        all_keys = set(db_logs_map.keys()) | set(loki_logs_map.keys())
        for key in all_keys:
            if key in db_logs_map:
                record = db_logs_map[key].copy()
                # Mark as merged if also exists in Loki
                if key in loki_logs_map:
                    record["source"] = "DB+Loki"
                results.append(record)
            else:
                results.append(loki_logs_map[key])
    elif source == "db":
        results = list(db_logs_map.values())
    else:
        results = list(loki_logs_map.values())
    
    # Sort by epoch desc
    results.sort(key=lambda x: x.get("_epoch", 0), reverse=True)
    
    # Total count
    total = len(results)
    
    # Paginate
    paginated = results[offset : offset + page_size]
    
    # Convert to response model (remove _epoch helper)
    items = []
    for r in paginated:
        r.pop("_epoch", None)
        items.append(AuditLogResponse(**r))
    
    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )

