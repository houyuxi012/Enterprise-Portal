"""
IAM Audit Router - IAM 审计日志查询路由
/iam/admin/audit-logs
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from iam.deps import get_db, PermissionChecker
from iam.audit.service import IAMAuditService
from .models import IAMAuditLog

router = APIRouter(prefix="/audit", tags=["iam-audit"])
logger = logging.getLogger(__name__)

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
    request: Request,
    action: Optional[str] = None,
    username: Optional[str] = None,
    target_type: Optional[str] = None,
    result: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    source: str = Query("db", pattern="^(db|loki|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(PermissionChecker("portal.logs.system.read"))
):
    """查询 IAM 审计日志 - 支持 DB/Loki 来源选择 (业务日志模式)"""
    db_records: List[Dict[str, Any]] = []
    loki_records: List[Dict[str, Any]] = []
    
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

    def build_merge_key(record: Dict[str, Any]) -> str:
        """Build stable dedupe key with trace_id priority to avoid dropping real events."""
        trace_id = record.get("trace_id")
        if trace_id:
            return f"trace:{trace_id}:{record.get('action')}:{record.get('target_type')}:{record.get('target_id')}"

        stable = {
            "timestamp": (
                record.get("timestamp").isoformat()
                if isinstance(record.get("timestamp"), datetime)
                else str(record.get("timestamp"))
            ),
            "username": record.get("username"),
            "action": record.get("action"),
            "target_type": record.get("target_type"),
            "target_id": record.get("target_id"),
            "target_name": record.get("target_name"),
            "result": record.get("result"),
            "reason": record.get("reason"),
        }
        return json.dumps(stable, sort_keys=True, ensure_ascii=False, default=str)
    
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
            db_records.append(log_dict)
    
    # Query from Loki
    if source in ("loki", "all"):
        try:
            loki_url = os.getenv("LOKI_PUSH_URL", "http://loki:3100")
            loki_headers = {"X-Scope-OrgID": os.getenv("LOKI_TENANT_ID", "enterprise-portal")}
            
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
                resp = await client.get(
                    f"{loki_url}/loki/api/v1/query_range",
                    params=params,
                    timeout=5.0,
                    headers=loki_headers
                )
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
                                if isinstance(ts, str):
                                    ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                                else:
                                    ts_dt = ts
                                log_dict = {
                                    "id": loki_id,
                                    "timestamp": ts_dt,
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
                                loki_records.append(log_dict)
                                loki_id += 1
                            except Exception:
                                continue
        except Exception as e:
            logger.warning(f"Failed to query Loki for IAM audit: {e}")
    
    # Merge and deduplicate (DB priority, with merge indicator)
    results = []
    if source == "all":
        merged_map: Dict[str, Dict[str, Any]] = {}
        for record in loki_records:
            merged_map[build_merge_key(record)] = record
        for record in db_records:
            merge_key = build_merge_key(record)
            if merge_key in merged_map:
                merged_record = record.copy()
                merged_record["source"] = "DB+Loki"
                merged_map[merge_key] = merged_record
            else:
                merged_map[merge_key] = record
        results = list(merged_map.values())
    elif source == "db":
        results = db_records
    else:
        results = loki_records
    
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

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db=db,
        action="iam.audit.read",
        target_type="iam_audit_logs",
        user_id=current_user.id,
        username=current_user.username,
        detail={
            "query": {
                "action": action,
                "username": username,
                "target_type": target_type,
                "result": result,
                "source": source,
                "page": page,
                "page_size": page_size,
                "start_time": start_time.isoformat() if start_time else None,
                "end_time": end_time.isoformat() if end_time else None,
            },
            "returned": len(items),
            "total": total,
        },
        ip_address=ip,
        trace_id=trace_id,
    )
    await db.commit()
    
    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )
