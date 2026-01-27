from fastapi import APIRouter, HTTPException
from schemas import AIChatRequest, AIChatResponse
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

# Initialize Gemini
# Expects GEMINI_API_KEY in .env
api_key = os.getenv("GEMINI_API_KEY")

if api_key:
    genai.configure(api_key=api_key)
    # Using gemini-2.0-flash as observed in frontend code, falling back to gemini-pro if needed
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
    except:
        model = genai.GenerativeModel('gemini-pro')
else:
    model = None

SYSTEM_INSTRUCTION = """你是 ShiKu Assistant，ShiKu Home 公司内网的官方 AI 指南。
你的任务是帮助员工查找公司政策、IT 支持和内部资源。

公司信息：
- 公司名称：ShiKu Home
- 核心价值观：创新、透明、以人为本。
- 常用工具：Slack, Jira, Confluence, ShiKu-Expenses。

回复原则：
1. 请使用中文回复。
2. 使用 Markdown 格式优化排版（如使用列表、加粗关键信息）。
3. 保持语气专业且亲切。
4. 如果不知道答案，请直接告知“我找不到相关信息，建议您联系人事部或IT部”。
"""

@router.post("/chat", response_model=AIChatResponse)
async def chat(request: AIChatRequest):
    if not model:
        raise HTTPException(status_code=500, detail="AI Service not configured (Missing API Key)")
    
    try:
        # Prepending system instruction for context
        full_prompt = f"{SYSTEM_INSTRUCTION}\n\nUser Question: {request.prompt}"
        
        response = model.generate_content(full_prompt)
        return AIChatResponse(response=response.text)
    except Exception as e:
        print(f"AI Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate response")
