import logging
import time
from typing import List, Optional
import json
import base64
from datetime import datetime, timezone
import ipaddress
import httpx
import os
import socket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
import models
import services.gemini_service
import re
from urllib.parse import urlparse
from google import genai
from google.genai import types

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

    async def chat(
        self,
        prompt: str,
        context: str = "",
        model_id: Optional[int] = None,
        image_url: Optional[str] = None,
        extra_meta: Optional[dict] = None,
        allowed_image_hosts: Optional[set[str]] = None,
    ) -> str:
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
            meta_info=extra_meta,  # Initialize with extra metadata
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
                image_data, mime_type = await self._download_image(
                    image_url, allowed_hosts=allowed_image_hosts
                )

            # 2. Get Provider
            if model_id:
                 provider_result = await self.db.execute(
                     select(models.AIProvider).where(
                         models.AIProvider.id == model_id,
                         models.AIProvider.is_active == True
                     )
                 )
                 provider = provider_result.scalar_one_or_none()
                 if not provider:
                     raise ValueError("Selected AI model is not active or does not exist")
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
            else:
                logger.info("No active provider, using default Gemini service")
                audit_entry.provider = "gemini"
                audit_entry.model = "gemini-pro"

            # 2.5. Quota Guard (per model/day)
            quota_ok, quota_reason = await self._enforce_model_quota(audit_entry.model or "")
            if not quota_ok:
                audit_entry.status = "BLOCKED"
                audit_entry.error_code = "QUOTA_EXCEEDED"
                audit_entry.error_reason = quota_reason
                return f"【系统限流】{quota_reason}"
            
            if not provider:
                response_text = await services.gemini_service.get_ai_response(safe_prompt, context, image_data, mime_type)
            else:
                try:
                    response_text = await self._call_provider(
                        provider,
                        safe_prompt,
                        context,
                        image_data=image_data,
                        mime_type=mime_type,
                    )
                except Exception as e:
                    logger.error(f"Provider {provider.name} failed: {e}")
                    audit_entry.status = "ERROR"
                    audit_entry.error_code = "PROVIDER_ERROR"
                    audit_entry.error_reason = str(e)[:500]
                    if image_url:
                        response_text = "当前模型未能处理图片输入，请切换支持视觉的模型，或补充更明确的文字问题。"
                    else:
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

    async def _enforce_model_quota(self, model_name: str) -> tuple[bool, str]:
        """
        Enforce daily quota by model.
        Returns (allowed, reason_if_blocked).
        """
        if not model_name:
            return True, ""

        result = await self.db.execute(
            select(models.AIModelQuota).where(models.AIModelQuota.model_name == model_name)
        )
        quota = result.scalar_one_or_none()
        if not quota:
            return True, ""

        daily_token_limit = int(quota.daily_token_limit or 0)
        daily_request_limit = int(quota.daily_request_limit or 0)
        if daily_token_limit <= 0 and daily_request_limit <= 0:
            return True, ""

        day_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        usage_result = await self.db.execute(
            select(
                func.count(models.AIAuditLog.id),
                func.coalesce(
                    func.sum(models.AIAuditLog.tokens_in + models.AIAuditLog.tokens_out),
                    0,
                ),
            ).where(
                models.AIAuditLog.model == model_name,
                models.AIAuditLog.ts >= day_start,
            )
        )
        row = usage_result.first()
        request_count = int(row[0] or 0) if row else 0
        token_count = int(row[1] or 0) if row else 0

        if daily_request_limit > 0 and request_count >= daily_request_limit:
            return False, f"模型 {model_name} 今日请求次数已达上限 ({daily_request_limit})"

        if daily_token_limit > 0 and token_count >= daily_token_limit:
            return False, f"模型 {model_name} 今日 Token 用量已达上限 ({daily_token_limit})"

        return True, ""
    
    def _resolve_and_validate_image_url(self, raw_url: str, allowed_hosts: Optional[set[str]]) -> str:
        """
        Validate image URL for vision input:
        - only trusted hosts
        - HTTPS by default (HTTP only for localhost)
        - block local/internal hosts unless explicitly trusted
        """
        raw = (raw_url or "").strip()
        if not raw:
            raise ValueError("Image URL cannot be empty")

        parsed = urlparse(raw)
        trusted_hosts = {h.lower() for h in (allowed_hosts or set()) if h}

        def _rewrite_minio_gateway_url(path: str, query: str) -> Optional[str]:
            minio_endpoint = (os.getenv("MINIO_ENDPOINT") or "").strip()
            if not minio_endpoint:
                return None
            internal_scheme = "https" if os.getenv("MINIO_SECURE", "false").lower() == "true" else "http"
            internal_path = path[len("/minio"):] if path.startswith("/minio") else path
            rewritten = f"{internal_scheme}://{minio_endpoint}{internal_path}"
            if query:
                rewritten = f"{rewritten}?{query}"
            return rewritten

        # Relative path: only allow internal upload/minio gateway path
        if not parsed.netloc:
            if not raw.startswith("/"):
                raise ValueError("Image URL must be absolute or start with '/'")
            if not (raw.startswith("/api/upload/files/") or raw.startswith("/minio/")):
                raise ValueError("Image URL path is not allowed")

            # Prefer direct internal MinIO access to avoid external TLS/cert issues.
            if parsed.path.startswith("/minio/"):
                rewritten = _rewrite_minio_gateway_url(parsed.path, parsed.query)
                if rewritten:
                    return rewritten

            public_base = (os.getenv("PORTAL_PUBLIC_BASE_URL") or os.getenv("PUBLIC_BASE_URL") or "").strip()
            if not public_base:
                raise ValueError("Relative image URL requires PUBLIC_BASE_URL or PORTAL_PUBLIC_BASE_URL")
            return f"{public_base.rstrip('/')}{raw}"

        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValueError("Image URL scheme must be HTTP or HTTPS")

        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise ValueError("Invalid image URL host")

        if trusted_hosts and host not in trusted_hosts:
            raise ValueError("Image URL host is not in trusted allowlist")

        # HTTPS required unless localhost debug
        if parsed.scheme.lower() == "http":
            localhost_set = {"localhost", "127.0.0.1", "::1"}
            if host not in localhost_set and not host.endswith(".localhost"):
                raise ValueError("Only HTTPS image URLs are allowed")

        blocked_hostnames = {
            "localhost",
            "localhost.localdomain",
            "host.docker.internal",
            "gateway.docker.internal",
        }
        allow_private = os.getenv("AI_IMAGE_ALLOW_PRIVATE_NETWORK", "false").lower() == "true"
        if not allow_private and host not in trusted_hosts:
            if host in blocked_hostnames or host.endswith(".local"):
                raise ValueError("Image URL cannot target local/internal hosts")

            if self._is_forbidden_ip(host):
                raise ValueError("Image URL cannot target private/special IP addresses")

            try:
                resolved_ips = {item[4][0].split("%")[0] for item in socket.getaddrinfo(host, None)}
            except socket.gaierror as e:
                raise ValueError("Image URL hostname could not be resolved") from e

            if any(self._is_forbidden_ip(ip) for ip in resolved_ips):
                raise ValueError("Image URL resolves to private/special IP addresses")

        # If URL points to public MinIO gateway route, rewrite to internal endpoint.
        if parsed.path.startswith("/minio/"):
            rewritten = _rewrite_minio_gateway_url(parsed.path, parsed.query)
            if rewritten:
                return rewritten

        return raw

    async def _download_image(self, url: str, allowed_hosts: Optional[set[str]] = None):
        """Download image with strict SSRF guardrails and response size limits."""
        validated_url = self._resolve_and_validate_image_url(url, allowed_hosts)
        max_bytes = int(os.getenv("AI_MAX_IMAGE_DOWNLOAD_BYTES", str(5 * 1024 * 1024)))
        timeout_seconds = float(os.getenv("AI_IMAGE_DOWNLOAD_TIMEOUT_SECONDS", "10"))

        try:
            async with httpx.AsyncClient(follow_redirects=False) as client:
                async with client.stream("GET", validated_url, timeout=timeout_seconds) as resp:
                    resp.raise_for_status()
                    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
                    if not content_type.startswith("image/"):
                        raise ValueError("Downloaded resource is not an image")

                    content = bytearray()
                    async for chunk in resp.aiter_bytes():
                        if not chunk:
                            continue
                        content.extend(chunk)
                        if len(content) > max_bytes:
                            raise ValueError(f"Image exceeds max allowed size ({max_bytes} bytes)")
                    return bytes(content), content_type
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Failed to download image {validated_url}: {e}")
            raise ValueError("Image download failed")

    async def _call_provider(
        self,
        provider: models.AIProvider,
        prompt: str,
        context: str,
        image_data: Optional[bytes] = None,
        mime_type: Optional[str] = None,
    ) -> str:
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
            # Migrate to Google GenAI SDK
            client = genai.Client(api_key=api_key)
            
            # Note: Provider base_url handling might differ in new SDK. 
            # If critical, check SDK docs for base_url support (usually client_options).
            # For now, we assume standard usage or rely on SDK defaults.
            
            contents = [full_content]
            if image_data and mime_type:
                contents.append(types.Part.from_bytes(data=image_data, mime_type=mime_type))
            
            response = await client.aio.models.generate_content(
                model=provider.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt
                )
            )
            return response.text

        elif provider.type in ["openai", "deepseek", "qwen", "zhipu", "dashscope"]:
            base_url = self._resolve_and_validate_base_url(provider.type, provider.base_url)
            url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"

            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            user_content: object = full_content
            if image_data and mime_type:
                image_b64 = base64.b64encode(image_data).decode("ascii")
                user_content = [
                    {"type": "text", "text": full_content},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{image_b64}"},
                    },
                ]

            payload = {
                "model": provider.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ]
            }
            
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, headers=headers, timeout=60)
                if resp.status_code != 200:
                     raise Exception(f"API Error ({resp.status_code}): {resp.text}")
                data = resp.json()
                return data['choices'][0]['message']['content']

        return "Unsupported Provider Type"

    @staticmethod
    def _is_forbidden_ip(host: str) -> bool:
        """Reject local/private/special addresses to mitigate SSRF."""
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return False
        return any([
            ip.is_loopback,
            ip.is_private,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_reserved,
            ip.is_unspecified,
        ])

    def _resolve_and_validate_base_url(self, provider_type: str, base_url: Optional[str]) -> str:
        """
        Enforce safe outbound provider URLs:
        - HTTPS only
        - no localhost/private/special destinations
        """
        defaults = {
            "deepseek": "https://api.deepseek.com/v1",
            "openai": "https://api.openai.com/v1",
        }

        resolved = (base_url or defaults.get(provider_type, "")).strip()
        if not resolved:
            raise ValueError("Missing provider base_url")

        parsed = urlparse(resolved)
        if parsed.scheme.lower() != "https":
            raise ValueError("Only HTTPS provider base_url is allowed")

        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise ValueError("Invalid provider base_url host")

        blocked_hostnames = {
            "localhost",
            "localhost.localdomain",
            "host.docker.internal",
            "gateway.docker.internal",
        }
        if host in blocked_hostnames or host.endswith(".local"):
            raise ValueError("Provider base_url cannot target local/internal hosts")

        allow_private = os.getenv("AI_PROVIDER_ALLOW_PRIVATE_NETWORK", "false").lower() == "true"
        if not allow_private:
            if self._is_forbidden_ip(host):
                raise ValueError("Provider base_url cannot target private or special IP addresses")

            try:
                resolved_ips = {item[4][0].split("%")[0] for item in socket.getaddrinfo(host, None)}
            except socket.gaierror as e:
                raise ValueError("Provider base_url hostname could not be resolved") from e

            if any(self._is_forbidden_ip(ip) for ip in resolved_ips):
                raise ValueError("Provider base_url resolves to private or special IP addresses")

        return resolved.rstrip("/")
