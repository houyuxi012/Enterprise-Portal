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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _=Depends(PermissionChecker("sys:settings:view")) # Or a more specific permission
):
    """查询 IAM 审计日志"""
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
    items = result_rows.scalars().all()
    
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(item) for item in items],  # Pydantic v2 use model_validate
        total=total,
        page=page,
        page_size=page_size
    )
