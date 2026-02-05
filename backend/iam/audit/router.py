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
    _=Depends(PermissionChecker("sys:settings:view")) # Or a more specific permission
):
    """查询 IAM 审计日志 - 支持 DB/Loki 来源选择"""
    import os
    import httpx
    import json
    from datetime import timezone
    
    items = []
    total = 0
    
    # Query from DB
    if source in ("db", "all"):
        query = select(IAMAuditLog)
        
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
        
        # Count total
        from sqlalchemy import func
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # Paginate
        query = query.order_by(desc(IAMAuditLog.timestamp))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result_rows = await db.execute(query)
        db_items = result_rows.scalars().all()
        # Set source to DB for each item
        for item in db_items:
            resp = AuditLogResponse.model_validate(item)
            resp.source = "DB"
            items.append(resp)
    
    # Query from Loki
    if source in ("loki", "all"):
        try:
            loki_url = os.getenv("LOKI_PUSH_URL", "http://loki:3100")
            
            # Build LogQL query
            label_filters = ['job="enterprise-portal"', 'log_type="IAM"']
            logql = '{' + ','.join(label_filters) + '}'
            
            # Time range
            now = datetime.now(timezone.utc)
            end = end_time if end_time else now
            start = start_time if start_time else now.replace(hour=0, minute=0, second=0, microsecond=0)
            
            params = {
                "query": logql,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "limit": page_size + (page - 1) * page_size
            }
            
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{loki_url}/loki/api/v1/query_range", params=params, timeout=5.0)
                if resp.status_code == 200:
                    data = resp.json()
                    streams = data.get("data", {}).get("result", [])
                    
                    loki_items = []
                    for stream in streams:
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
                                
                                loki_items.append(AuditLogResponse(
                                    id=int(value[0][:10]),  # Use timestamp prefix as pseudo-ID
                                    timestamp=datetime.fromisoformat(log_line.get("timestamp", now.isoformat())),
                                    user_id=log_line.get("user_id"),
                                    username=log_line.get("username"),
                                    action=log_line.get("action", ""),
                                    target_type=log_line.get("target_type", ""),
                                    target_id=log_line.get("target_id"),
                                    target_name=log_line.get("target_name"),
                                    detail=log_line.get("detail"),
                                    ip_address=log_line.get("ip_address"),
                                    result=log_line.get("result"),
                                    reason=log_line.get("reason"),
                                    trace_id=log_line.get("trace_id"),
                                    source="Loki"
                                ))
                            except Exception:
                                continue
                    
                    if source == "loki":
                        total = len(loki_items)
                        items = loki_items[(page-1)*page_size : page*page_size]
                    else:
                        # Merge with DB results for 'all' source
                        items.extend(loki_items)
                        total += len(loki_items)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to query Loki for IAM audit: {e}")
    
    # Sort by timestamp descending for merged results
    if source == "all":
        items.sort(key=lambda x: x.timestamp, reverse=True)
        items = items[(page-1)*page_size : page*page_size]
    
    return AuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )

