"""
Unified Log Repository Abstraction Layer

Provides Writer/Reader/Repository pattern for all log operations:
- LogWriter: Write abstraction (DB, Loki)
- LogReader: Read abstraction (DB, Loki)
- LogRepository: Facade that routes by log_type

Routing Strategy:
- ACCESS: Loki only (high volume, ephemeral)
- BUSINESS/AI: DB (primary) + Loki (sidecar)
- SYSTEM: DB only
"""
import asyncio
import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Protocol

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

logger = logging.getLogger(__name__)


# =============================================================================
# Data Models
# =============================================================================

@dataclass
class LogEntry:
    """Standardized log entry for all log types."""
    trace_id: str
    timestamp: str  # ISO8601
    level: str      # INFO | WARN | ERROR
    log_type: str   # BUSINESS | AI | SYSTEM | ACCESS
    action: str
    status: str     # SUCCESS | FAIL
    
    # Source classification
    source: Optional[str] = None  # database | component | ai_engine | access
    request_id: Optional[str] = None
    
    # Common fields
    user_id: Optional[int] = None
    username: Optional[str] = None
    target: Optional[str] = None
    ip_address: Optional[str] = None
    detail: Optional[str] = None
    
    # AI-specific fields
    provider: Optional[str] = None
    model: Optional[str] = None
    policy_hits: Optional[list[str]] = field(default_factory=list)
    latency_ms: Optional[int] = None
    tokens: Optional[int] = None
    
    # Access log specific fields
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: Optional[int] = None
    user_agent: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}

    def to_loki_line(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


@dataclass
class LogQuery:
    """Query parameters for log reads."""
    log_type: Optional[str] = None
    limit: int = 100
    offset: int = 0
    operator: Optional[str] = None
    action: Optional[str] = None
    path: Optional[str] = None
    status_code: Optional[int] = None
    trace_id: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


# =============================================================================
# Writer Abstractions
# =============================================================================

class LogWriter(ABC):
    """Abstract base for log writers."""
    
    @abstractmethod
    async def write(self, entry: LogEntry) -> bool:
        """Write a log entry. Returns True on success."""
        pass
    
    async def close(self):
        """Cleanup resources."""
        pass


class DbLogWriter(LogWriter):
    """PostgreSQL log writer using SQLAlchemy."""
    
    def __init__(self, db_session_factory: Callable):
        self.db_session_factory = db_session_factory
    
    async def write(self, entry: LogEntry) -> bool:
        try:
            async with self.db_session_factory() as db:
                if entry.log_type == "BUSINESS":
                    from models import BusinessLog
                    log_obj = BusinessLog(
                        operator=entry.username or "",
                        action=entry.action,
                        target=entry.target,
                        ip_address=entry.ip_address,
                        status=entry.status,
                        detail=entry.detail,
                        trace_id=entry.trace_id,
                        source=entry.source or "WEB",
                        timestamp=entry.timestamp
                    )
                    db.add(log_obj)
                    await db.commit()
                    return True
                elif entry.log_type == "SYSTEM":
                    from models import SystemLog
                    log_obj = SystemLog(
                        level=entry.level,
                        module=entry.source or "SYSTEM",
                        message=entry.action,
                        detail=entry.detail,
                        trace_id=entry.trace_id,
                        timestamp=entry.timestamp
                    )
                    db.add(log_obj)
                    await db.commit()
                    return True
                elif entry.log_type == "AI":
                    # AI logs can reuse BusinessLog or a dedicated table
                    from models import BusinessLog
                    log_obj = BusinessLog(
                        operator=entry.username or "AI",
                        action=entry.action,
                        target=entry.target or entry.model,
                        ip_address=entry.ip_address,
                        status=entry.status,
                        detail=f"provider={entry.provider}, model={entry.model}, latency={entry.latency_ms}ms",
                        trace_id=entry.trace_id,
                        source="AI",
                        timestamp=entry.timestamp
                    )
                    db.add(log_obj)
                    await db.commit()
                    return True
                else:
                    logger.warning(f"Unknown log_type for DB: {entry.log_type}")
                    return False
        except Exception as e:
            logger.error(f"DbLogWriter.write failed: {e}")
            return False


class LokiLogWriter(LogWriter):
    """Loki Push API log writer with buffering."""
    
    def __init__(self, loki_url: str, buffer_size: int = 10, flush_interval: float = 5.0):
        self.loki_url = loki_url.rstrip("/")
        self.push_url = f"{self.loki_url}/loki/api/v1/push"
        self.buffer: List[LogEntry] = []
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval
        self._lock = asyncio.Lock()
        self._client: Optional[httpx.AsyncClient] = None
        self._flush_task: Optional[asyncio.Task] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client
    
    async def write(self, entry: LogEntry) -> bool:
        """Buffer entry for batch push. Always returns True (non-blocking)."""
        async with self._lock:
            self.buffer.append(entry)
            if len(self.buffer) >= self.buffer_size:
                asyncio.create_task(self._flush())
        return True
    
    async def _flush(self):
        """Flush buffer to Loki."""
        async with self._lock:
            if not self.buffer:
                return
            entries_to_send = self.buffer[:]
            self.buffer.clear()
        
        try:
            client = await self._get_client()
            
            # Build proper Loki payload format
            loki_payload = {"streams": []}
            for entry in entries_to_send:
                stream_labels = {
                    "job": "enterprise-portal",
                    "log_type": entry.log_type,
                    "level": entry.level
                }
                ts_ns = str(int(datetime.utcnow().timestamp() * 1e9))
                loki_payload["streams"].append({
                    "stream": stream_labels,
                    "values": [[ts_ns, entry.to_loki_line()]]
                })
            
            resp = await client.post(self.push_url, json=loki_payload)
            if resp.status_code not in (200, 204):
                logger.warning(f"Loki push failed: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.warning(f"LokiLogWriter._flush error: {e}")
    
    async def start_periodic_flush(self):
        """Start background flush task."""
        while True:
            await asyncio.sleep(self.flush_interval)
            await self._flush()
    
    async def close(self):
        await self._flush()
        if self._client:
            await self._client.aclose()


# =============================================================================
# Reader Abstractions
# =============================================================================

class LogReader(ABC):
    """Abstract base for log readers."""
    
    @abstractmethod
    async def query(self, q: LogQuery) -> List[Dict[str, Any]]:
        """Query logs. Returns list of log dicts."""
        pass


class DbLogReader(LogReader):
    """PostgreSQL log reader using SQLAlchemy."""
    
    def __init__(self, db_session_factory: Callable):
        self.db_session_factory = db_session_factory
    
    async def query(self, q: LogQuery) -> List[Dict[str, Any]]:
        try:
            async with self.db_session_factory() as db:
                if q.log_type == "BUSINESS" or q.log_type == "AI":
                    from models import BusinessLog
                    query = select(BusinessLog).order_by(desc(BusinessLog.id))
                    if q.operator:
                        query = query.filter(BusinessLog.operator.contains(q.operator))
                    if q.action:
                        query = query.filter(BusinessLog.action == q.action)
                    result = await db.execute(query.limit(q.limit).offset(q.offset))
                    logs = result.scalars().all()
                    return [
                        {
                            "id": log.id,
                            "operator": log.operator,
                            "action": log.action,
                            "target": log.target,
                            "ip_address": log.ip_address,
                            "status": log.status,
                            "detail": log.detail,
                            "timestamp": log.timestamp,
                            "source": log.source or "DB",
                            "trace_id": log.trace_id
                        }
                        for log in logs
                    ]
                elif q.log_type == "SYSTEM":
                    from models import SystemLog
                    query = select(SystemLog).order_by(desc(SystemLog.id))
                    result = await db.execute(query.limit(q.limit).offset(q.offset))
                    logs = result.scalars().all()
                    return [
                        {
                            "id": log.id,
                            "level": log.level,
                            "module": log.module,
                            "message": log.message,
                            "detail": log.detail,
                            "timestamp": log.timestamp
                        }
                        for log in logs
                    ]
                return []
        except Exception as e:
            logger.error(f"DbLogReader.query failed: {e}")
            return []


class LokiLogReader(LogReader):
    """Loki Query API log reader."""
    
    def __init__(self, loki_url: str):
        self.loki_url = loki_url.rstrip("/")
        self.query_url = f"{self.loki_url}/loki/api/v1/query_range"
    
    async def query(self, q: LogQuery) -> List[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Build LogQL query
                labels = ['job="enterprise-portal"']
                if q.log_type:
                    labels.append(f'log_type="{q.log_type}"')
                query_str = "{" + ",".join(labels) + "}"
                
                resp = await client.get(
                    self.query_url,
                    params={"query": query_str, "limit": q.limit}
                )
                
                if resp.status_code != 200:
                    return []
                
                data = resp.json()
                results = []
                for stream in data.get("data", {}).get("result", []):
                    for value in stream.get("values", []):
                        try:
                            log_data = json.loads(value[1])
                            # Apply filters
                            if q.path and q.path not in log_data.get("path", ""):
                                continue
                            if q.status_code and log_data.get("status_code") != q.status_code:
                                continue
                            if q.operator and q.operator not in log_data.get("username", ""):
                                continue
                            
                            results.append({
                                "id": len(results) + 1,
                                **log_data
                            })
                        except json.JSONDecodeError:
                            pass
                
                return results[:q.limit]
        except Exception as e:
            logger.warning(f"LokiLogReader.query error: {e}")
            return []


# =============================================================================
# Repository Facade
# =============================================================================

class LogRepository:
    """
    Unified log repository with smart routing.
    
    Routing:
    - ACCESS: Loki only
    - BUSINESS/AI: DB + Loki
    - SYSTEM: DB only
    """
    
    def __init__(
        self,
        db_session_factory: Callable,
        loki_url: Optional[str] = None
    ):
        self.db_writer = DbLogWriter(db_session_factory)
        self.db_reader = DbLogReader(db_session_factory)
        
        self.loki_writer: Optional[LokiLogWriter] = None
        self.loki_reader: Optional[LokiLogReader] = None
        
        if loki_url:
            self.loki_writer = LokiLogWriter(loki_url)
            self.loki_reader = LokiLogReader(loki_url)
            # Start periodic flush
            asyncio.create_task(self.loki_writer.start_periodic_flush())
    
    async def write(self, entry: LogEntry) -> bool:
        """
        Write log entry with smart routing.
        Returns True if primary write succeeds.
        
        IMPORTANT: Loki writes are always async fire-and-forget,
        they NEVER block the main business flow.
        """
        log_type = entry.log_type.upper()
        
        if log_type == "ACCESS":
            # Loki only - fire-and-forget, never block
            if self.loki_writer:
                asyncio.create_task(self._safe_loki_write(entry))
                return True  # Always return True immediately
            logger.warning("ACCESS log but no Loki writer configured")
            return False
        
        elif log_type in ("BUSINESS", "AI"):
            # DB (primary) + Loki (sidecar, fire-and-forget)
            success = await self.db_writer.write(entry)
            if self.loki_writer:
                # Fire-and-forget sidecar - never wait
                asyncio.create_task(self._safe_loki_write(entry))
            return success
        
        elif log_type == "SYSTEM":
            # DB only
            return await self.db_writer.write(entry)
        
        else:
            logger.warning(f"Unknown log_type: {log_type}")
            return False
    
    async def _safe_loki_write(self, entry: LogEntry):
        """Safely write to Loki, catching all exceptions."""
        try:
            await self.loki_writer.write(entry)
        except Exception as e:
            logger.warning(f"Loki write failed (non-blocking): {e}")
    
    async def read(self, query: LogQuery) -> List[Dict[str, Any]]:
        """
        Read logs with smart routing.
        """
        log_type = (query.log_type or "").upper()
        
        if log_type == "ACCESS":
            if self.loki_reader:
                return await self.loki_reader.query(query)
            return []
        
        elif log_type in ("BUSINESS", "AI", "SYSTEM", ""):
            return await self.db_reader.query(query)
        
        else:
            return []
    
    async def close(self):
        """Cleanup all resources."""
        await self.db_writer.close()
        if self.loki_writer:
            await self.loki_writer.close()


# =============================================================================
# Global Instance
# =============================================================================

_global_repository: Optional[LogRepository] = None


def init_log_repository(db_session_factory: Callable, loki_url: Optional[str] = None) -> LogRepository:
    """Initialize global log repository."""
    global _global_repository
    _global_repository = LogRepository(db_session_factory, loki_url)
    logger.info(f"LogRepository initialized (loki={bool(loki_url)})")
    return _global_repository


def get_log_repository() -> Optional[LogRepository]:
    """Get global log repository instance."""
    return _global_repository


async def shutdown_log_repository():
    """Shutdown global log repository."""
    global _global_repository
    if _global_repository:
        await _global_repository.close()
        _global_repository = None
