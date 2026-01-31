import logging
from typing import List, Optional
import json
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import models
import services.gemini_service
import re

logger = logging.getLogger("ai_engine")

class AIEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_provider(self) -> Optional[models.AIProvider]:
        stmt = select(models.AIProvider).where(models.AIProvider.is_active == True).limit(1)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def check_security_policies(self, text: str) -> dict:
        """
        Check input against enabled policies.
        Returns: {"allowed": bool, "action": str, "reason": str, "masked_text": str}
        """
        stmt = select(models.AISecurityPolicy).where(models.AISecurityPolicy.is_enabled == True)
        result = await self.db.execute(stmt)
        policies = result.scalars().all()

        check_result = {"allowed": True, "action": "allow", "reason": "", "masked_text": text}

        for policy in policies:
            try:
                # Content is JSON list of keywords or rules
                rules = json.loads(policy.content) if policy.content else []
                
                if policy.type == "keyword":
                    for rule in rules:
                        if rule in check_result["masked_text"]:
                            if policy.action == "block":
                                return {"allowed": False, "action": "block", "reason": f"Blocked by keyword: {rule}", "masked_text": text}
                            elif policy.action == "mask":
                                check_result["masked_text"] = check_result["masked_text"].replace(rule, "**")
                                check_result["action"] = "mask"
                            elif policy.action == "warn":
                                # Just log or tag, but allow
                                check_result["action"] = "warn"
                                check_result["reason"] = f"Triggered warning: {rule}"

                elif policy.type == "regex":
                    for rule in rules:
                        if re.search(rule, check_result["masked_text"]):
                             if policy.action == "block":
                                return {"allowed": False, "action": "block", "reason": f"Blocked by pattern", "masked_text": text}
                             elif policy.action == "mask":
                                 check_result["masked_text"] = re.sub(rule, "**", check_result["masked_text"])

                elif policy.type == "length":
                     # Rule example: "1000" (max length)
                     limit = int(rules[0]) if rules else 2000
                     if len(check_result["masked_text"]) > limit:
                         if policy.action == "block":
                              return {"allowed": False, "action": "block", "reason": "Length limit exceeded", "masked_text": text}

            except Exception as e:
                logger.error(f"Error evaluating policy {policy.name}: {e}")

        return check_result

    async def chat(self, prompt: str, context: str = "") -> str:
        # 1. Input Security Check
        in_check = await self.check_security_policies(prompt)
        if not in_check["allowed"]:
            return f"【系统拦截】请求被拒绝：{in_check['reason']}"
        
        # Use masked text if masking occurred
        safe_prompt = in_check["masked_text"]

        # 2. Get Provider
        provider = await self.get_active_provider()
        
        full_prompt = prompt
        if context:
            full_prompt = f"Context:\n{context}\n\nQuestion: {prompt}"

        response_text = ""
        
        if not provider:
            # Fallback to default Gemini Service if no active provider configured
            logger.info("No active provider, using default Gemini service")
            response_text = await services.gemini_service.get_ai_response(safe_prompt, context)
        else:
            try:
                response_text = await self._call_provider(provider, safe_prompt, context)
            except Exception as e:
                logger.error(f"Provider {provider.name} failed: {e}")
                response_text = "AI 服务暂时不可用，请联系管理员。"

        # 3. Output Security Check
        out_check = await self.check_security_policies(response_text)
        if not out_check["allowed"]:
            return f"【系统拦截】响应内容包含敏感信息，已屏蔽。"
        
        return out_check["masked_text"]

    async def _call_provider(self, provider: models.AIProvider, prompt: str, context: str) -> str:
        from services.crypto_service import CryptoService
        
        # Decrypt API Key (AES)
        api_key = provider.api_key
        try:
             # If it looks like a Fernet token (starts with gAAAA...)
             if api_key and api_key.startswith("gAAAA"):
                 api_key = CryptoService.decrypt_data(api_key)
        except Exception:
             # Fallback to plain text usage (legacy keys)
             pass

        system_prompt = "You are a helpful enterprise assistant. Answer based on the context provided if available."
        full_content = f"Context: {context}\n\nUser Question: {prompt}" if context else prompt

        if provider.type == "gemini":
            # Using standard gemini logic, but with dynamic key
            # Reusing gemini_service logic but overriding key? 
            # Ideally gemini_service should accept key.
            # implementing direct call here for simplicity
            url = f"{provider.base_url or 'https://generativelanguage.googleapis.com/v1beta/models'}/{provider.model}:generateContent?key={api_key}"
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json={
                    "contents": [{"parts": [{"text": full_content}]}]
                }, timeout=30)
                if resp.status_code != 200:
                    raise Exception(f"Gemini API Error: {resp.text}")
                data = resp.json()
                return data['candidates'][0]['content']['parts'][0]['text']

        elif provider.type in ["openai", "deepseek", "qwen", "zhipu", "dashscope"]:
            # OpenAI Compatible Interface
            # DeepSeek: https://api.deepseek.com/v1/chat/completions
            # Qwen/Dashscope: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
            
            base_url = provider.base_url
            if not base_url:
                if provider.type == "deepseek": base_url = "https://api.deepseek.com/v1"
                elif provider.type == "openai": base_url = "https://api.openai.com/v1"
            
            if not base_url.endswith("/v1") and not base_url.endswith("/chat/completions"):
                 # Simple heuristic fix, usually user provides up to base
                 pass

            if not base_url.endswith("/chat/completions"):
                 url = f"{base_url}/chat/completions"
            else:
                 url = base_url

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": provider.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": full_content}
                ]
            }
            
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=headers, timeout=60)
                if resp.status_code != 200:
                     raise Exception(f"API Error ({resp.status_code}): {resp.text}")
                data = resp.json()
                return data['choices'][0]['message']['content']

        return "Unsupported Provider Type"
