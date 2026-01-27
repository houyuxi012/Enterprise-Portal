from fastapi import APIRouter, Depends, HTTPException
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
