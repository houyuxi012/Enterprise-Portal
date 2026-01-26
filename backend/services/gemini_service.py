import os
import google.generativeai as genai

# Configure the Gemini API with the key from environment variables
api_key = os.getenv("API_KEY")
if api_key:
    genai.configure(api_key=api_key)

SYSTEM_INSTRUCTION = """你是 ShiKu Assistant，ShiKu Home 公司内网的官方 AI 指南。
你的任务是帮助员工查找公司政策、IT 支持和内部资源。

公司信息：
- 公司名称：ShiKu Home
- 核心价值观：创新、透明、以人为本。
- 常用工具：Slack, Jira, Confluence, ShiKu-Expenses。

回复原则：
1. 请使用中文回复。
2. 使用 Markdown 格式优化排版（如使用列表、加粗关键信息）。
3. 保持语气亲切、专业且富有帮助精神。
4. 如果遇到你不了解的具体内部记录，建议用户通过导航栏工具联系人力资源部（HR）或 IT 部门。"""

async def get_ai_response(prompt: str) -> str:
    if not api_key:
        return "如果你配置了API Key，这里将显示AI回复。"
    
    try:
        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash', # Using a standard model name available
            system_instruction=SYSTEM_INSTRUCTION
        )
        response = await model.generate_content_async(prompt)
        return response.text
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return "抱歉，目前连接网络出现问题。请稍后再试。"
