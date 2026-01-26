from fastapi import APIRouter, Depends
import schemas
from services.gemini_service import get_ai_response
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models
from sqlalchemy import select, or_

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

@router.post("/chat", response_model=schemas.ChatResponse)
async def chat(request: schemas.ChatRequest, db: AsyncSession = Depends(get_db)):
    # 1. Search Database for Context (RAG-lite)
    search_term = f"%{request.prompt.split()[0]}%" # Simple first-word matching or full match
    if len(request.prompt) > 2:
        search_term = f"%{request.prompt}%"

    context_lines = []

    # Search Employees
    emp_result = await db.execute(
        select(models.Employee).where(
            or_(
                models.Employee.name.ilike(search_term),
                models.Employee.role.ilike(search_term),
                models.Employee.department.ilike(search_term)
            )
        ).limit(3)
    )
    employees = emp_result.scalars().all()
    if employees:
        context_lines.append("【相关人员】")
        for e in employees:
            context_lines.append(f"- {e.name} (职位: {e.role}, 部门: {e.department}, 状态: {e.status})")

    # Search News
    news_result = await db.execute(
        select(models.NewsItem).where(
            or_(
                models.NewsItem.title.ilike(search_term),
                models.NewsItem.summary.ilike(search_term)
            )
        ).limit(3)
    )
    news = news_result.scalars().all()
    if news:
        context_lines.append("【相关资讯】")
        for n in news:
            context_lines.append(f"- {n.title} (日期: {n.date}): {n.summary}")

    context_str = "\n".join(context_lines)
    
    # 2. Get AI Response with Context
    response_text = await get_ai_response(request.prompt, context=context_str)
    return schemas.ChatResponse(response=response_text)
