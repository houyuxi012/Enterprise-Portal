"""
LogSink Abstraction Layer

Provides a unified interface for writing logs to multiple destinations:
- DbSink: Primary storage (PostgreSQL) - synchronous, transactional
- LokiSink: Sidecar storage (Loki HTTP Push) - async, buffered, non-blocking
- CompositeLogSink: Orchestrates primary + sidecar writes

Design Principles:
- DB is the source of truth; its failure fails the operation.
- Sidecar failures are logged/monitored but never block the main flow.
"""
import asyncio
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Callable, Optional

import httpx

logger = logging.getLogger(__name__)


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
    request_id: Optional[str] = None  # Unique request identifier
    
    # Optional common fields
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
        """Format as structured log line for Loki."""
        import json
        return json.dumps(self.to_dict(), ensure_ascii=False)


class LogSink(ABC):
    """Abstract base class for log sinks."""
    
    @abstractmethod
    async def emit(self, entry: LogEntry) -> bool:
        """
        Write a log entry. Returns True on success, False on failure.
        """
        pass

    async def close(self):
        """Cleanup resources. Override if needed."""
        pass


class DbSink(LogSink):
    """
    Database primary sink.
    This sink writes to PostgreSQL via the existing AuditService.
    It's a thin wrapper that delegates to the actual DB write logic.
    """
    
    def __init__(self, db_write_func: Callable):
        """
        Args:
            db_write_func: Async function to write log to DB.
                           Signature: async def(entry: LogEntry) -> bool
        """
        self.db_write_func = db_write_func

    async def emit(self, entry: LogEntry) -> bool:
        try:
            return await self.db_write_func(entry)
        except Exception as e:
            logger.error(f"DbSink write failed: {e}")
            return False


class LokiSink(LogSink):
    """
    Loki HTTP Push sink (sidecar, async, buffered).
    
    Features:
    - Batches log entries to reduce HTTP overhead.
    - Flushes periodically or when buffer is full.
    - Never blocks the main request flow.
    - Failures are logged but do not affect the caller.
    """
    
    def __init__(
        self,
        loki_url: str,
        job_name: str = "enterprise-portal",
        buffer_size: int = 50,
        flush_interval: float = 5.0,
    ):
        self.loki_url = loki_url.rstrip("/")
        self.job_name = job_name
        self.buffer: list[LogEntry] = []
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval
        self._lock = asyncio.Lock()
        self._flush_task: Optional[asyncio.Task] = None
        self._running = True
        
        # Metrics (for Prometheus integration later)
        self.push_success_count = 0
        self.push_failure_count = 0

    async def emit(self, entry: LogEntry) -> bool:
        """Add entry to buffer. Always returns True (non-blocking)."""
        async with self._lock:
            self.buffer.append(entry)
            if len(self.buffer) >= self.buffer_size:
                # Schedule immediate flush
                asyncio.create_task(self._flush())
        return True

    async def start_periodic_flush(self):
        """Start background flush task."""
        self._running = True
        self._flush_task = asyncio.create_task(self._periodic_flush_loop())

    async def _periodic_flush_loop(self):
        while self._running:
            await asyncio.sleep(self.flush_interval)
            await self._flush()

    async def _flush(self):
        """Flush buffered entries to Loki."""
        async with self._lock:
            if not self.buffer:
                return
            batch = self.buffer.copy()
            self.buffer.clear()

        try:
            payload = self._format_loki_payload(batch)
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.loki_url}/loki/api/v1/push",
                    json=payload,
                    timeout=5.0,
                    headers={"Content-Type": "application/json"}
                )
                if resp.status_code >= 400:
                    logger.warning(f"Loki push failed: {resp.status_code} - {resp.text}")
                    self.push_failure_count += len(batch)
                else:
                    self.push_success_count += len(batch)
        except Exception as e:
            logger.error(f"Loki push error: {e}")
            self.push_failure_count += len(batch)

    def _format_loki_payload(self, entries: list[LogEntry]) -> dict:
        """
        Format entries for Loki Push API.
        
        Loki expects:
        {
            "streams": [
                {
                    "stream": {"job": "...", "level": "...", ...},
                    "values": [["<timestamp_ns>", "<log_line>"], ...]
                }
            ]
        }
        """
        # Group by log_type for better label cardinality
        streams_by_type: dict[str, list] = {}
        
        for entry in entries:
            stream_key = entry.log_type
            if stream_key not in streams_by_type:
                streams_by_type[stream_key] = []
            
            # Loki timestamp is in nanoseconds
            ts_ns = str(int(datetime.fromisoformat(entry.timestamp.replace("Z", "+00:00")).timestamp() * 1e9))
            streams_by_type[stream_key].append([ts_ns, entry.to_loki_line()])

        streams = []
        for log_type, values in streams_by_type.items():
            streams.append({
                "stream": {
                    "job": self.job_name,
                    "log_type": log_type,
                },
                "values": values
            })

        return {"streams": streams}

    async def close(self):
        """Stop periodic flush and flush remaining entries."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self._flush()


class CompositeLogSink(LogSink):
    """
    Orchestrates writes to primary (DB) and sidecar (Loki/etc) sinks.
    
    Behavior:
    - Primary sink failure = overall failure.
    - Sidecar sink failures are fire-and-forget (logged, not blocking).
    """
    
    def __init__(self, primary: LogSink, sidecars: list[LogSink] = None):
        self.primary = primary
        self.sidecars = sidecars or []

    async def emit(self, entry: LogEntry) -> bool:
        # 1. Primary must succeed
        success = await self.primary.emit(entry)
        if not success:
            return False
        
        # 2. Sidecars are non-blocking
        for sidecar in self.sidecars:
            asyncio.create_task(self._safe_sidecar_emit(sidecar, entry))
        
        return True

    async def _safe_sidecar_emit(self, sink: LogSink, entry: LogEntry):
        try:
            await sink.emit(entry)
        except Exception as e:
            logger.warning(f"Sidecar sink '{sink.__class__.__name__}' error: {e}")

    async def close(self):
        await self.primary.close()
        for sidecar in self.sidecars:
            await sidecar.close()


# --- Global Singleton Management ---

_global_log_sink: Optional[CompositeLogSink] = None


def get_log_sink() -> Optional[CompositeLogSink]:
    """Get the global log sink instance."""
    return _global_log_sink


def init_log_sink(db_write_func: Callable, loki_url: Optional[str] = None) -> CompositeLogSink:
    """
    Initialize the global log sink.
    
    Args:
        db_write_func: Async function to write log to DB.
        loki_url: Optional Loki Push API URL. If None, only DB sink is used.
    
    Returns:
        The initialized CompositeLogSink.
    """
    global _global_log_sink
    
    db_sink = DbSink(db_write_func)
    sidecars = []
    
    if loki_url:
        loki_sink = LokiSink(loki_url)
        sidecars.append(loki_sink)
        # Start periodic flush in background
        asyncio.create_task(loki_sink.start_periodic_flush())
        logger.info(f"LokiSink initialized: {loki_url}")
    
    _global_log_sink = CompositeLogSink(db_sink, sidecars)
    logger.info("CompositeLogSink initialized")
    return _global_log_sink


async def shutdown_log_sink():
    """Gracefully shutdown the global log sink."""
    global _global_log_sink
    if _global_log_sink:
        await _global_log_sink.close()
        _global_log_sink = None
