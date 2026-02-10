"""
Log Forwarding Service

Real forwarding pipeline for configured sinks:
- SYSLOG (UDP)
- WEBHOOK (HTTP POST)
"""
import ast
import asyncio
import json
import logging
import socket
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select

import models
from database import SessionLocal

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 15
_forwarding_cache: dict[str, Any] = {"expires_at": 0.0, "items": []}


def invalidate_forwarding_cache():
    """Invalidate in-memory forwarding config cache."""
    _forwarding_cache["expires_at"] = 0.0
    _forwarding_cache["items"] = []


def _normalize_log_types(raw: Any) -> set[str]:
    default_types = {"BUSINESS", "SYSTEM", "ACCESS"}
    if raw is None:
        return default_types

    parsed = raw
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return default_types
        try:
            parsed = json.loads(text)
        except Exception:
            try:
                parsed = ast.literal_eval(text)
            except Exception:
                # Fallback for comma-separated strings and PostgreSQL array text:
                # "{BUSINESS,SYSTEM}" or "BUSINESS,SYSTEM"
                cleaned = text.strip("{}")
                parsed = [part.strip().strip('"').strip("'") for part in cleaned.split(",") if part.strip()]

    if isinstance(parsed, str):
        parsed = [parsed]

    if isinstance(parsed, (list, tuple, set)):
        normalized = {str(item).upper().strip() for item in parsed if str(item).strip()}
        return normalized or default_types

    return default_types


async def _get_enabled_configs() -> list[models.LogForwardingConfig]:
    now = time.time()
    if now < _forwarding_cache["expires_at"]:
        return _forwarding_cache["items"]

    async with SessionLocal() as db:
        result = await db.execute(
            select(models.LogForwardingConfig).where(models.LogForwardingConfig.enabled.is_(True))
        )
        items = result.scalars().all()

    _forwarding_cache["items"] = items
    _forwarding_cache["expires_at"] = now + _CACHE_TTL_SECONDS
    return items


def _send_syslog_udp(endpoint: str, port: int, message: str):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.sendto(message.encode("utf-8", errors="ignore"), (endpoint, port))


async def _forward_to_syslog(cfg: models.LogForwardingConfig, payload: dict[str, Any]):
    endpoint = (cfg.endpoint or "").strip()
    if not endpoint:
        return
    port = int(cfg.port or 514)
    msg = json.dumps(payload, ensure_ascii=False)
    await asyncio.to_thread(_send_syslog_udp, endpoint, port, msg)


async def _forward_to_webhook(cfg: models.LogForwardingConfig, payload: dict[str, Any]):
    endpoint = (cfg.endpoint or "").strip()
    if not endpoint:
        return

    headers = {"Content-Type": "application/json"}
    if cfg.secret_token:
        headers["Authorization"] = f"Bearer {cfg.secret_token}"
        headers["X-Log-Token"] = cfg.secret_token

    async with httpx.AsyncClient(timeout=4.0) as client:
        resp = await client.post(endpoint, json=payload, headers=headers)
        if resp.status_code >= 400:
            raise RuntimeError(f"webhook status={resp.status_code}")


async def forward_log(log_type: str, event: dict[str, Any]):
    """
    Forward one structured log event based on enabled forwarding configs.
    """
    normalized_type = (log_type or "").upper().strip()
    if not normalized_type:
        return

    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "log_type": normalized_type,
        "event": event,
    }

    try:
        configs = await _get_enabled_configs()
    except Exception as e:
        logger.warning(f"Failed to load log forwarding config: {e}")
        return

    tasks: list[asyncio.Task] = []
    targets: list[models.LogForwardingConfig] = []
    for cfg in configs:
        allowed_types = _normalize_log_types(cfg.log_types)
        if normalized_type not in allowed_types:
            continue

        cfg_type = (cfg.type or "").upper().strip()
        if cfg_type == "SYSLOG":
            tasks.append(asyncio.create_task(_forward_to_syslog(cfg, payload)))
            targets.append(cfg)
        elif cfg_type == "WEBHOOK":
            tasks.append(asyncio.create_task(_forward_to_webhook(cfg, payload)))
            targets.append(cfg)
        else:
            logger.warning(f"Unknown log forwarding type: {cfg.type}")

    if not tasks:
        return

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for cfg, result in zip(targets, results):
        if isinstance(result, Exception):
            logger.warning(
                f"Forwarding failed type={cfg.type} endpoint={cfg.endpoint}: {result}"
            )


async def _forward_log_safe(log_type: str, event: dict[str, Any]):
    try:
        await forward_log(log_type, event)
    except Exception as e:
        logger.warning(f"Forward log task failed: {e}")


def emit_log_fire_and_forget(log_type: str, event: dict[str, Any]):
    """
    Non-blocking emit helper for business request paths.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_forward_log_safe(log_type, event))
