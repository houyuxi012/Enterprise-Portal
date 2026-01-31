from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from typing import List
from schemas import AIChatRequest, AIChatResponse, AIProviderTestRequest, AIModelOption
from database import get_db
from models import Employee, NewsItem, QuickTool, AIProvider
from services.ai_engine import AIEngine

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

@router.get("/models", response_model=List[AIModelOption])
async def get_models(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIProvider).where(AIProvider.is_active == True))
    providers = result.scalars().all()
    return [
        AIModelOption(
            id=p.id,
            name=p.name,
            model=p.model,
            type=p.type
        ) for p in providers
    ]

@router.post("/admin/providers/test")
async def test_provider(request: AIProviderTestRequest, db: AsyncSession = Depends(get_db)):
    try:
        engine = AIEngine(db)
        # Create a temporary provider object
        temp_provider = AIProvider(
            name=request.name,
            type=request.type,
            base_url=request.base_url,
            api_key=request.api_key,
            model=request.model,
            is_active=True
        )
        
        # Call provider with a simple prompt
        response = await engine._call_provider(temp_provider, "Hello, this is a connection test.", "")
        return {"status": "success", "message": "Connection successful", "response": response}
    except Exception as e:
        print(f"Test Provider Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/chat", response_model=AIChatResponse)
async def chat(request: AIChatRequest, db: AsyncSession = Depends(get_db)):
    try:
        query = request.prompt.lower()
        context_parts = []
        engine = AIEngine(db)

        # 1. Input Security Check (Fail Fast)
        # We do this inside engine.chat usually, but doing it here saves DB context queries if blocked.
        # But for simplicity, let engine handle it all.

        # 2. RAG Context Retrieval
        # 2.1 Search Employees
        emp_stmt = select(Employee).filter(
            or_(
                Employee.name.ilike(f"%{query}%"),
                Employee.department.ilike(f"%{query}%"),
                Employee.role.ilike(f"%{query}%"),
                Employee.location.ilike(f"%{query}%")
            )
        )
        result = await db.execute(emp_stmt)
        employees = result.scalars().all()
        
        if employees:
            emp_info = "\n".join([f"- {e.name} ({e.role}, {e.department}): 电话 {e.phone}, 邮箱 {e.email}, 办公地 {e.location}" for e in employees])
            context_parts.append(f"【相关人员信息】:\n{emp_info}")

        # 2.2 Search News
        news_stmt = select(NewsItem).filter(
            or_(
                NewsItem.title.ilike(f"%{query}%"),
                NewsItem.summary.ilike(f"%{query}%"),
                NewsItem.category.ilike(f"%{query}%")
            )
        ).limit(3)
        result = await db.execute(news_stmt)
        news = result.scalars().all()

        if news:
            news_info = "\n".join([f"- [{n.category}] {n.title} (发布于 {n.date}): {n.summary}" for n in news])
            context_parts.append(f"【相关新闻资讯】:\n{news_info}")

        # 2.3 Search Tools
        tool_stmt = select(QuickTool).filter(
            or_(
                QuickTool.name.ilike(f"%{query}%"),
                QuickTool.category.ilike(f"%{query}%"),
                QuickTool.description.ilike(f"%{query}%")
            )
        )
        result = await db.execute(tool_stmt)
        tools = result.scalars().all()

        if tools:
            tool_info = "\n".join([f"- {t.name} ({t.category}): {t.description} -> 链接: {t.url}" for t in tools])
            context_parts.append(f"【相关工具应用】:\n{tool_info}")

        context = "\n\n".join(context_parts)
        
        # 3. Get AI Response via Engine
        response_text = await engine.chat(request.prompt, context, model_id=request.model_id)
        
        return AIChatResponse(response=response_text)
        
    except Exception as e:
        print(f"Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
