"""
AI Audit Writer - 抽象写入层，支持 PostgreSQL + Loki 双写
严禁存储: API Key/Token/Cookie 明文；严禁保存 prompt/output 全文
"""
import logging
import hashlib
import uuid
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Protocol
from dataclasses import dataclass, field, asdict
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class AIAuditEntry:
    """AI 审计日志条目"""
    # 标识
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ts: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # 环境
    env: str = "production"
    service: str = "enterprise-portal"
    request_id: Optional[str] = None
    trace_id: Optional[str] = None
    
    # 用户
    actor_type: str = "user"  # user/admin/system/api
    actor_id: Optional[int] = None
    actor_ip: Optional[str] = None
    session_id: Optional[str] = None
    
    # 资源
    resource_type: str = "ai_chat"
    resource_id: Optional[str] = None
    action: str = "CHAT"  # CHAT/COMPLETION/IMAGE_GEN/SEARCH
    
    # AI 提供商
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None  # 临时存储，写入时转为 fingerprint
    
    # 安全策略
    input_policy_result: Optional[str] = None  # ALLOW/BLOCK/MASK/WARN
    output_policy_result: Optional[str] = None
    policy_hits: List[str] = field(default_factory=list)
    
    # 性能
    latency_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    
    # 状态
    status: str = "SUCCESS"  # SUCCESS/BLOCKED/ERROR/TIMEOUT
    error_code: Optional[str] = None
    error_reason: Optional[str] = None
    
    # 内容 (临时存储，写入时转为 hash)
    prompt: Optional[str] = None  # 临时，不存储
    output: Optional[str] = None  # 临时，不存储
    
    # 元数据 (RAG 引用、搜索结果等)
    meta_info: Optional[dict] = None
    
    # 来源
    source: str = "ai_audit"
    
    @property
    def api_key_fingerprint(self) -> Optional[str]:
        """生成 API Key 指纹 (SHA256 前 16 位)，不可逆"""
        if self.api_key:
            return hashlib.sha256(self.api_key.encode()).hexdigest()[:16]
        return None
    
    @property
    def prompt_hash(self) -> Optional[str]:
        """生成 Prompt 哈希 (SHA256)"""
        if self.prompt:
            return hashlib.sha256(self.prompt.encode()).hexdigest()
        return None
    
    @property
    def output_hash(self) -> Optional[str]:
        """生成 Output 哈希 (SHA256)"""
        if self.output:
            return hashlib.sha256(self.output.encode()).hexdigest()
        return None
    
    @property
    def prompt_preview(self) -> Optional[str]:
        """脱敏预览 (前 200 字符)"""
        if self.prompt:
            preview = self.prompt[:200]
            # 简单脱敏: 替换可能的敏感模式
            import re
            preview = re.sub(r'\b\d{11}\b', '***', preview)  # 手机号
            preview = re.sub(r'\b\d{18}\b', '***', preview)  # 身份证
            preview = re.sub(r'[\w.-]+@[\w.-]+\.\w+', '***', preview)  # 邮箱
            return preview
        return None


class AuditWriter(Protocol):
    """审计写入接口"""
    async def write(self, entry: AIAuditEntry) -> None:
        ...


class DbAuditWriter:
    """PostgreSQL 写入实现"""
    
    def __init__(self, db_session_factory):
        self.db_session_factory = db_session_factory
    
    async def write(self, entry: AIAuditEntry) -> None:
        try:
            from models import AIAuditLog
            
            async with self.db_session_factory() as db:
                log_entry = AIAuditLog(
                    event_id=entry.event_id,
                    ts=entry.ts,
                    env=entry.env,
                    service=entry.service,
                    request_id=entry.request_id,
                    trace_id=entry.trace_id,
                    actor_type=entry.actor_type,
                    actor_id=entry.actor_id,
                    actor_ip=entry.actor_ip,
                    session_id=entry.session_id,
                    resource_type=entry.resource_type,
                    resource_id=entry.resource_id,
                    action=entry.action,
                    provider=entry.provider,
                    model=entry.model,
                    api_key_fingerprint=entry.api_key_fingerprint,
                    input_policy_result=entry.input_policy_result,
                    output_policy_result=entry.output_policy_result,
                    policy_hits=json.dumps(entry.policy_hits) if entry.policy_hits else None,
                    latency_ms=entry.latency_ms,
                    tokens_in=entry.tokens_in,
                    tokens_out=entry.tokens_out,
                    status=entry.status,
                    error_code=entry.error_code,
                    error_reason=entry.error_reason,
                    prompt_hash=entry.prompt_hash,
                    output_hash=entry.output_hash,
                    prompt_preview=entry.prompt_preview,
                    source=entry.source,
                    meta_info=entry.meta_info  # Support JSON meta info
                )
                db.add(log_entry)
                await db.commit()
                logger.debug(f"AI audit log written to DB: {entry.event_id}")
        except Exception as e:
            logger.error(f"Failed to write AI audit log to DB: {e}")


class LokiAuditWriter:
    """Loki Push API 写入实现"""
    
    def __init__(self, loki_url: str = "http://loki:3100"):
        self.loki_url = loki_url
    
    async def write(self, entry: AIAuditEntry) -> None:
        try:
            import httpx
            
            # 构建 Loki Push 格式
            ts_ns = str(int(entry.ts.timestamp() * 1e9))
            log_line = json.dumps({
                "event_id": entry.event_id,
                "actor_type": entry.actor_type,
                "actor_id": entry.actor_id,
                "actor_ip": entry.actor_ip,
                "action": entry.action,
                "provider": entry.provider,
                "model": entry.model,
                "status": entry.status,
                "latency_ms": entry.latency_ms,
                "tokens_in": entry.tokens_in,
                "tokens_out": entry.tokens_out,
                "input_policy_result": entry.input_policy_result,
                "output_policy_result": entry.output_policy_result,
                "error_code": entry.error_code,
                "meta_info": entry.meta_info  # Include meta info in Loki log
            })
            
            payload = {
                "streams": [{
                    "stream": {
                        "job": "enterprise-portal",
                        "log_type": "AI",
                        "source": entry.source,
                        "env": entry.env
                    },
                    "values": [[ts_ns, log_line]]
                }]
            }
            
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.loki_url}/loki/api/v1/push",
                    json=payload,
                    timeout=5.0
                )
                if resp.status_code not in (200, 204):
                    logger.warning(f"Loki push failed: {resp.status_code}")
                else:
                    logger.debug(f"AI audit log pushed to Loki: {entry.event_id}")
        except Exception as e:
            logger.warning(f"Failed to push AI audit log to Loki (non-blocking): {e}")


class CompositeAuditWriter:
    """组合写入: DB(主) + Loki(旁路)"""
    
    def __init__(self, db_writer: DbAuditWriter, loki_writer: Optional[LokiAuditWriter] = None):
        self.db_writer = db_writer
        self.loki_writer = loki_writer
    
    async def write(self, entry: AIAuditEntry) -> None:
        # DB 写入 (主，同步等待)
        await self.db_writer.write(entry)
        
        # Loki 写入 (旁路，非阻塞)
        if self.loki_writer:
            asyncio.create_task(self.loki_writer.write(entry))


# 全局 Writer 实例 (延迟初始化)
_audit_writer: Optional[CompositeAuditWriter] = None


def init_ai_audit_writer(db_session_factory, loki_enabled: bool = True, loki_url: str = "http://loki:3100"):
    """初始化 AI 审计写入器"""
    global _audit_writer
    
    db_writer = DbAuditWriter(db_session_factory)
    loki_writer = LokiAuditWriter(loki_url) if loki_enabled else None
    _audit_writer = CompositeAuditWriter(db_writer, loki_writer)
    
    logger.info(f"AI Audit Writer initialized (Loki: {'enabled' if loki_enabled else 'disabled'})")


def get_ai_audit_writer() -> Optional[CompositeAuditWriter]:
    """获取 AI 审计写入器"""
    return _audit_writer


async def log_ai_audit(entry: AIAuditEntry) -> None:
    """便捷方法: 写入 AI 审计日志"""
    writer = get_ai_audit_writer()
    if writer:
        await writer.write(entry)
    else:
        logger.warning("AI Audit Writer not initialized, skipping audit log")
