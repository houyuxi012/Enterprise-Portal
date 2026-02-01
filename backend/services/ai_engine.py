import logging
import time
import hashlib
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
    def __init__(self, db: AsyncSession, user_id: Optional[int] = None, user_ip: Optional[str] = None, 
                 trace_id: Optional[str] = None, session_id: Optional[str] = None):
        self.db = db
        self.user_id = user_id
        self.user_ip = user_ip
        self.trace_id = trace_id
        self.session_id = session_id

    async def get_active_provider(self) -> Optional[models.AIProvider]:
        stmt = select(models.AIProvider).where(models.AIProvider.is_active == True).limit(1)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def check_security_policies(self, text: str) -> dict:
        """
        Check input against enabled policies.
        Returns: {"allowed": bool, "action": str, "reason": str, "masked_text": str, "hits": list}
        """
        stmt = select(models.AISecurityPolicy).where(models.AISecurityPolicy.is_enabled == True)
        result = await self.db.execute(stmt)
        policies = result.scalars().all()

        check_result = {"allowed": True, "action": "ALLOW", "reason": "", "masked_text": text, "hits": []}

        for policy in policies:
            try:
                rules = json.loads(policy.content) if policy.content else []
                
                if policy.type == "keyword":
                    for rule in rules:
                        if rule in check_result["masked_text"]:
                            if policy.action == "block":
                                return {"allowed": False, "action": "BLOCK", "reason": f"Blocked by keyword: {rule}", "masked_text": text, "hits": [f"keyword:{rule}"]}
                            elif policy.action == "mask":
                                check_result["masked_text"] = check_result["masked_text"].replace(rule, "**")
                                check_result["action"] = "MASK"
                                check_result["hits"].append(f"keyword:{rule}")
                            elif policy.action == "warn":
                                check_result["action"] = "WARN"
                                check_result["reason"] = f"Triggered warning: {rule}"
                                check_result["hits"].append(f"warn:{rule}")

                elif policy.type == "regex":
                    for rule in rules:
                        if re.search(rule, check_result["masked_text"]):
                             if policy.action == "block":
                                return {"allowed": False, "action": "BLOCK", "reason": f"Blocked by pattern", "masked_text": text, "hits": [f"regex:{rule}"]}
                             elif policy.action == "mask":
                                 check_result["masked_text"] = re.sub(rule, "**", check_result["masked_text"])
                                 check_result["hits"].append(f"regex:***")

                elif policy.type == "length":
                     limit = int(rules[0]) if rules else 2000
                     if len(check_result["masked_text"]) > limit:
                         if policy.action == "block":
                              return {"allowed": False, "action": "BLOCK", "reason": "Length limit exceeded", "masked_text": text, "hits": ["length:exceeded"]}

            except Exception as e:
                logger.error(f"Error evaluating policy {policy.name}: {e}")

        return check_result

    async def chat(self, prompt: str, context: str = "", model_id: Optional[int] = None, image_url: Optional[str] = None) -> str:
        from services.ai_audit_writer import AIAuditEntry, log_ai_audit
        from services.crypto_service import CryptoService
        
        start_time = time.time()
        
        # 初始化审计条目
        audit_entry = AIAuditEntry(
            actor_type="user" if self.user_id else "system",
            actor_id=self.user_id,
            actor_ip=self.user_ip,
            trace_id=self.trace_id,
            session_id=self.session_id,
            action="CHAT",
            prompt=prompt,
        )
        
        response_text = ""
        provider = None
        api_key_raw = None
        
        try:
            # 1. Input Security Check
            in_check = await self.check_security_policies(prompt)
            audit_entry.input_policy_result = in_check["action"]
            audit_entry.policy_hits = in_check.get("hits", [])
            
            if not in_check["allowed"]:
                audit_entry.status = "BLOCKED"
                audit_entry.error_code = "INPUT_BLOCKED"
                audit_entry.error_reason = in_check["reason"]
                return f"【系统拦截】请求被拒绝：{in_check['reason']}"
            
            safe_prompt = in_check["masked_text"]
            
            # Pre-fetch Image if present
            image_data = None
            mime_type = None
            if image_url:
                image_data, mime_type = await self._download_image(image_url)

            # 2. Get Provider
            if model_id:
                 provider = await self.db.get(models.AIProvider, model_id)
            else:
                 provider = await self.get_active_provider()
            
            full_prompt = prompt
            if context:
                full_prompt = f"Context:\n{context}\n\nQuestion: {prompt}"

            if provider:
                audit_entry.provider = provider.type
                audit_entry.model = provider.model
                audit_entry.resource_id = f"{provider.type}:{provider.model}"
                
                # Decrypt API Key for fingerprint
                api_key_raw = provider.api_key
                try:
                    if api_key_raw and api_key_raw.startswith("gAAAA"):
                        api_key_raw = CryptoService.decrypt_data(api_key_raw)
                except Exception:
                    pass
                audit_entry.api_key = api_key_raw  # 存储用于生成指纹，不会直接写入 DB
            
            if not provider:
                logger.info("No active provider, using default Gemini service")
                audit_entry.provider = "gemini"
                audit_entry.model = "gemini-pro"
                response_text = await services.gemini_service.get_ai_response(safe_prompt, context, image_data, mime_type)
            else:
                try:
                    response_text = await self._call_provider(provider, safe_prompt, context)
                except Exception as e:
                    logger.error(f"Provider {provider.name} failed: {e}")
                    audit_entry.status = "ERROR"
                    audit_entry.error_code = "PROVIDER_ERROR"
                    audit_entry.error_reason = str(e)[:500]
                    response_text = "AI 服务暂时不可用，请联系管理员。"

            # 3. Output Security Check
            out_check = await self.check_security_policies(response_text)
            audit_entry.output_policy_result = out_check["action"]
            if out_check.get("hits"):
                audit_entry.policy_hits.extend(out_check["hits"])
            
            if not out_check["allowed"]:
                audit_entry.status = "BLOCKED"
                audit_entry.error_code = "OUTPUT_BLOCKED"
                return f"【系统拦截】响应内容包含敏感信息，已屏蔽。"
            
            # 设置输出用于生成 hash
            audit_entry.output = response_text
            
            # 估算 Token 数 (简单估算: 字符数 / 4)
            audit_entry.tokens_in = len(prompt) // 4
            audit_entry.tokens_out = len(response_text) // 4
            
            if audit_entry.status != "BLOCKED" and audit_entry.status != "ERROR":
                audit_entry.status = "SUCCESS"
            
            return out_check["masked_text"]
            
        except Exception as e:
            logger.error(f"AI Engine error: {e}")
            audit_entry.status = "ERROR"
            audit_entry.error_code = "SYSTEM_ERROR"
            audit_entry.error_reason = str(e)[:500]
            raise
        finally:
            # 计算延迟并写入审计日志
            audit_entry.latency_ms = int((time.time() - start_time) * 1000)
            try:
                await log_ai_audit(audit_entry)
            except Exception as e:
                logger.error(f"Failed to write AI audit log: {e}")
    
    async def _download_image(self, url: str):
        """Helper to download image from URL (local or remote)"""
        try:
             if "uploads/" in url:
                   pass
             
             async with httpx.AsyncClient() as client:
                 resp = await client.get(url, timeout=10.0)
                 resp.raise_for_status()
                 content_type = resp.headers.get("content-type")
                 return resp.content, content_type
        except Exception as e:
            logger.error(f"Failed to download image {url}: {e}")
            return None, None

    async def _call_provider(self, provider: models.AIProvider, prompt: str, context: str) -> str:
        from services.crypto_service import CryptoService
        
        api_key = provider.api_key
        try:
             if api_key and api_key.startswith("gAAAA"):
                 api_key = CryptoService.decrypt_data(api_key)
        except Exception:
             pass

        system_prompt = "You are a helpful enterprise assistant. Answer based on the context provided if available."
        full_content = f"Context: {context}\n\nUser Question: {prompt}" if context else prompt

        if provider.type == "gemini":
            url = f"{provider.base_url or 'https://generativelanguage.googleapis.com/v1beta/models'}/{provider.model}:generateContent?key={api_key}"
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json={
                    "contents": [{"parts": [{"text": full_content}]}]
                }, timeout=30)
                if resp.status_code != 200:
                    logger.warning(f"Gemini API Error: {resp.status_code} - {resp.text[:200]}")
                    raise Exception(f"Gemini API Error: {resp.text}")
                data = resp.json()
                return data['candidates'][0]['content']['parts'][0]['text']

        elif provider.type in ["openai", "deepseek", "qwen", "zhipu", "dashscope"]:
            base_url = provider.base_url
            if not base_url:
                if provider.type == "deepseek": base_url = "https://api.deepseek.com/v1"
                elif provider.type == "openai": base_url = "https://api.openai.com/v1"
            
            if not base_url.endswith("/v1") and not base_url.endswith("/chat/completions"):
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
