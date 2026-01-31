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

@router.get("/", response_model=List[schemas.QuickTool])
async def read_tools(db: AsyncSession = Depends(get_db)):
    # Sort by priority (high to low), then by ID (newest first)
    result = await db.execute(select(models.QuickTool).order_by(models.QuickTool.sort_order.desc(), models.QuickTool.id.desc()))
    tools = result.scalars().all()
    return tools

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
    await AuditService.log_business_action(
        db, 
        user_id=current_user.id, 
        username=current_user.username, 
        action="UPDATE_APP", 
        target=f"应用:{tool.id} ({tool.name})", 
        ip_address=ip,
        trace_id=trace_id
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
