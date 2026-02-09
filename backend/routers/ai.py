import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from typing import List
from schemas import AIChatRequest, AIChatResponse, AIProviderTestRequest, AIModelOption
from database import get_db
from dependencies import PermissionChecker
from routers.auth import get_current_user
from models import Employee, NewsItem, QuickTool, AIProvider, User
from services.ai_engine import AIEngine
from middleware.trace_context import get_trace_id

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

@router.get("/models", response_model=List[AIModelOption])
async def get_models(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
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
async def test_provider(
    request_body: AIProviderTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker("sys:settings:edit"))
):
    try:
        engine = AIEngine(db)
        temp_provider = AIProvider(
            name=request_body.name,
            type=request_body.type,
            base_url=request_body.base_url,
            api_key=request_body.api_key,
            model=request_body.model,
            is_active=True
        )
        
        response = await engine._call_provider(temp_provider, "Hello, this is a connection test.", "")
        return {"status": "success", "message": "Connection successful", "response": response}
    except ValueError as e:
        logger.warning("Provider test blocked for user %s: %s", getattr(current_user, "username", "unknown"), e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Provider test failed for user %s", getattr(current_user, "username", "unknown"))
        raise HTTPException(status_code=400, detail="Provider test failed")

@router.post("/chat", response_model=AIChatResponse)
async def chat(
    request_body: AIChatRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        query = request_body.prompt.lower()
        context_parts = []
        
        # 提取用户信息用于审计
        user_id = current_user.id
        user_ip = request.client.host if request.client else None
        trace_id = get_trace_id()
        session_id = request.cookies.get("session_id")
        
        engine = AIEngine(
            db, 
            user_id=user_id, 
            user_ip=user_ip, 
            trace_id=trace_id, 
            session_id=session_id
        )

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
        
        # 3. Get AI Response via Engine (with audit logging)
        response_text = await engine.chat(
            request_body.prompt,
            context,
            model_id=request_body.model_id,
            image_url=request_body.image_url,
        )
        
        return AIChatResponse(response=response_text)
        
    except Exception as e:
        print(f"Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
