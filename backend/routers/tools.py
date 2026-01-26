from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import database, models, schemas
from sqlalchemy import select

router = APIRouter(
    prefix="/tools",
    tags=["tools"]
)

@router.get("/", response_model=List[schemas.QuickTool])
async def read_tools(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.QuickTool).offset(skip).limit(limit))
    tools = result.scalars().all()
    return tools

@router.post("/", response_model=schemas.QuickTool)
async def create_tool(tool: schemas.QuickToolCreate, db: AsyncSession = Depends(database.get_db)):
    db_tool = models.QuickTool(**tool.dict())
    db.add(db_tool)
    await db.commit()
    await db.refresh(db_tool)
    return db_tool
