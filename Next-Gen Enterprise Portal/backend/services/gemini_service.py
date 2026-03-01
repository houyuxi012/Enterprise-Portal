import os
from google import genai
from google.genai import types

# Configure the Gemini API with the key from environment variables
api_key = os.getenv("GEMINI_API_KEY")

SYSTEM_INSTRUCTION = """你是 ShiKu Assistant，ShiKu Home 公司内网的官方 AI 指南。
你的任务是根据提供的【上下文信息】回答员工的问题。

核心原则：
1. **优先使用上下文**：如果上下文中包含答案，请直接引用事实回答。
2. **诚实致歉**：如果上下文中没有相关信息，请直接回答“抱歉，我在内部知识库中未找到相关信息”，不要编造。
3. **格式优化**：使用 Markdown，保持简洁专业。
"""

async def get_ai_response(prompt: str, context: str = "", image_data: bytes = None, mime_type: str = None) -> str:
    if not api_key:
        return "【系统提示】请配置 API Key 以启用 AI 智能回答。"
    
    try:
        client = genai.Client(api_key=api_key)
        
        full_prompt = f"""
【上下文信息】
{context}

【用户问题】
{prompt}
"""
        contents = [full_prompt]
        if image_data and mime_type:
             # google-genai supports bytes or PIL image
             # For raw bytes, we often wrap in types.Part or pass directly if supported
             # SDK 0.x: supports sending images as Part.
             contents.append(types.Part.from_bytes(data=image_data, mime_type=mime_type))

        response = await client.aio.models.generate_content(
            model='gemini-2.0-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION
            )
        )
        return response.text
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return "抱歉，目前连接网络出现问题，无法获取智能回答。"
