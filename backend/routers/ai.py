from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from schemas import AIChatRequest, AIChatResponse
from database import get_db
from models import Employee, NewsItem, QuickTool
from services.gemini_service import get_ai_response

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

@router.post("/chat", response_model=AIChatResponse)
async def chat(request: AIChatRequest, db: AsyncSession = Depends(get_db)):
    try:
        query = request.prompt.lower()
        context_parts = []

        # 1. Search Employees
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

        # 2. Search News
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

        # 3. Search Tools
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
        
        # 4. Get AI Response
        response_text = await get_ai_response(request.prompt, context)
        
        return AIChatResponse(response=response_text)
        
    except Exception as e:
        print(f"RAG Error: {e}")
        # Fallback to pure AI if DB search fails or other error
        try:
             response_text = await get_ai_response(request.prompt, "")
             return AIChatResponse(response=response_text)
        except:
             raise HTTPException(status_code=500, detail="Failed to process request")
