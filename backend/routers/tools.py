from fastapi import APIRouter, Depends, HTTPException
from dependencies import PermissionChecker
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
import models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/tools",
    tags=["tools"]
)

@router.get("/", response_model=List[schemas.QuickTool])
async def read_tools(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.QuickTool))
    tools = result.scalars().all()
    return tools

@router.post("/", response_model=schemas.QuickTool, dependencies=[Depends(PermissionChecker("content:tool:edit"))])
async def create_tool(tool: schemas.QuickToolCreate, db: AsyncSession = Depends(get_db)):
    db_tool = models.QuickTool(**tool.dict())
    db.add(db_tool)
    await db.commit()
    await db.refresh(db_tool)
    return db_tool

@router.put("/{tool_id}", response_model=schemas.QuickTool, dependencies=[Depends(PermissionChecker("content:tool:edit"))])
async def update_tool(tool_id: int, tool_update: schemas.QuickToolCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.QuickTool).filter(models.QuickTool.id == tool_id))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    for key, value in tool_update.dict().items():
        setattr(tool, key, value)
        
    await db.commit()
    await db.refresh(tool)
    return tool

@router.delete("/{tool_id}", dependencies=[Depends(PermissionChecker("content:tool:edit"))])
async def delete_tool(tool_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.QuickTool).filter(models.QuickTool.id == tool_id))
    tool = result.scalars().first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
        
    await db.delete(tool)
    await db.commit()
    return {"ok": True}
