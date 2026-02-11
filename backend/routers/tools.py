from fastapi import APIRouter, Depends, HTTPException, Request
from dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
from services.audit_service import AuditService
from routers.auth import get_current_user
import models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/tools",
    tags=["tools"]
)

import json

@router.get("/", response_model=List[schemas.QuickTool])
async def read_tools(
    admin_view: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Sort by priority (high to low), then by ID (newest first)
    result = await db.execute(select(models.QuickTool).order_by(models.QuickTool.sort_order.desc(), models.QuickTool.id.desc()))
    tools = result.scalars().all()
    
    # Determine if user has admin-view capability via role/permission.
    normalized_role_codes = {(getattr(role, "code", "") or "").lower() for role in (current_user.roles or [])}
    is_admin_role = bool(normalized_role_codes.intersection({"portaladmin", "portal_admin", "superadmin", "admin"}))
    has_admin_permission = any(
        (getattr(permission, "code", "") or "").strip() in {"admin:access", "portal.admin:access"}
        for role in (current_user.roles or [])
        for permission in (getattr(role, "permissions", []) or [])
    )
    is_admin = is_admin_role or has_admin_permission or (
        (getattr(current_user, "account_type", "PORTAL") or "PORTAL").upper() == "SYSTEM"
    )
                
    # If admin view requested and user is admin, return all tools
    if admin_view and is_admin:
        return tools
        
    # Get Employee info to find department
    emp_result = await db.execute(select(models.Employee).filter(models.Employee.account == current_user.username))
    employee = emp_result.scalars().first()
    user_dept = employee.department if employee else None
    
    allowed_tools = []
    for tool in tools:
        # If visible_to_departments is empty/null, it's visible to everyone
        if not tool.visible_to_departments:
            allowed_tools.append(tool)
            continue
            
        try:
            allowed_depts = json.loads(tool.visible_to_departments)
            # If the list is empty, treat as specific restriction (no one sees it)
            if not allowed_depts:
                continue

            if user_dept and user_dept in allowed_depts:
                 allowed_tools.append(tool)
        except:
             # On error, default to hide
             pass
             
    return allowed_tools

@router.post("/", response_model=schemas.QuickTool, dependencies=[Depends(PermissionChecker("content:tool:edit"))])
async def create_tool(
    request: Request,
    tool: schemas.QuickToolCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_tool = models.QuickTool(**tool.dict())
    db.add(db_tool)
    await db.commit()
    await db.refresh(db_tool)
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="CREATE_APP", 
        target=f"应用:{db_tool.id} ({db_tool.name})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()

    return db_tool

@router.put("/{tool_id}", response_model=schemas.QuickTool, dependencies=[Depends(PermissionChecker("content:tool:edit"))])
async def update_tool(
    request: Request,
    tool_id: int, 
    tool_update: schemas.QuickToolCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.QuickTool).filter(models.QuickTool.id == tool_id))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    try:
        for key, value in tool_update.dict().items():
            setattr(tool, key, value)
            
        await db.commit()
        await db.refresh(tool)
    except Exception as e:
        import traceback
        traceback.print_exc() # Print to console
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed: {str(e)}")
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    
    action = "UPDATE_APP"
    # Check if this was a permission update
    if "visible_to_departments" in tool_update.dict(exclude_unset=True):
         action = "UPDATE_APP_PERMISSION"
    
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action=action, 
        target=f"应用:{tool.id} ({tool.name})", 
        ip_address=ip,
        trace_id=trace_id,
        detail=f"权限变更: {tool.visible_to_departments}" if action == "UPDATE_APP_PERMISSION" else None
    )
    await db.commit()

    return tool

@router.delete("/{tool_id}", dependencies=[Depends(PermissionChecker("content:tool:edit"))])
async def delete_tool(
    request: Request,
    tool_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    result = await db.execute(select(models.QuickTool).filter(models.QuickTool.id == tool_id))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
        
    name = tool.name
    await db.delete(tool)
    await db.commit()
    
    # Audit Log
    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="DELETE_APP", 
        target=f"应用:{tool_id} ({name})", 
        ip_address=ip,
        trace_id=trace_id
    )
    await db.commit()
    
    return {"ok": True}
