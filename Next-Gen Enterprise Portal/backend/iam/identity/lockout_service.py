"""
Lockout Service - 登录锁定、失败计数、IP 限流

从 IdentityService 拆分而来，包含登录失败计数、账户/IP 锁定逻辑。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ── 常量 ──
LOGIN_FAIL_CACHE_PREFIX = "iam:login:fail:principal:"
LOGIN_FAIL_IP_CACHE_PREFIX = "iam:login:fail:ip:"
LOGIN_LOCK_IP_CACHE_PREFIX = "iam:login:lock:ip:"
LOGIN_FAIL_CACHE_TTL_SECONDS = 15 * 60
LOCKOUT_MODE_ACCOUNT = "account"
LOCKOUT_MODE_IP = "ip"


def login_fail_cache_key(*, audience: str, ip: str, username: str) -> str:
    principal = (username or "").strip().lower() or "unknown"
    client_ip = ip or "unknown"
    aud = audience or "unknown"
    return f"{LOGIN_FAIL_CACHE_PREFIX}{aud}:{client_ip}:{principal}"


def login_fail_ip_cache_key(*, audience: str, ip: str) -> str:
    client_ip = ip or "unknown"
    aud = audience or "unknown"
    return f"{LOGIN_FAIL_IP_CACHE_PREFIX}{aud}:{client_ip}"


def login_lock_ip_cache_key(*, audience: str, ip: str) -> str:
    client_ip = ip or "unknown"
    aud = audience or "unknown"
    return f"{LOGIN_LOCK_IP_CACHE_PREFIX}{aud}:{client_ip}"


def parse_cached_int(raw) -> int:
    if raw is None:
        return 0
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    if isinstance(raw, str):
        raw = raw.strip()
        if raw == "":
            return 0
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return 0


async def get_login_fail_count(*, audience: str, ip: str, username: str) -> int:
    from infrastructure.cache_manager import cache
    key = login_fail_cache_key(audience=audience, ip=ip, username=username)
    try:
        raw = await cache.get(key, is_json=False)
        return parse_cached_int(raw)
    except Exception:
        return 0


async def increase_login_fail_count(*, audience: str, ip: str, username: str) -> int:
    from infrastructure.cache_manager import cache
    key = login_fail_cache_key(audience=audience, ip=ip, username=username)
    count = await get_login_fail_count(audience=audience, ip=ip, username=username)
    count += 1
    try:
        await cache.set(
            key,
            str(count),
            ttl=LOGIN_FAIL_CACHE_TTL_SECONDS,
            is_json=False,
        )
    except Exception as e:
        logger.warning("Failed to update login fail counter key=%s: %s", key, e)
    return count


async def clear_login_fail_count(*, audience: str, ip: str, username: str):
    from infrastructure.cache_manager import cache
    key = login_fail_cache_key(audience=audience, ip=ip, username=username)
    try:
        await cache.delete(key)
    except Exception as e:
        logger.warning("Failed to clear login fail counter key=%s: %s", key, e)


async def get_login_fail_ip_count(*, audience: str, ip: str) -> int:
    from infrastructure.cache_manager import cache
    key = login_fail_ip_cache_key(audience=audience, ip=ip)
    try:
        raw = await cache.get(key, is_json=False)
        return parse_cached_int(raw)
    except Exception:
        return 0


async def increase_login_fail_ip_count(*, audience: str, ip: str) -> int:
    from infrastructure.cache_manager import cache
    key = login_fail_ip_cache_key(audience=audience, ip=ip)
    count = await get_login_fail_ip_count(audience=audience, ip=ip)
    count += 1
    try:
        await cache.set(
            key,
            str(count),
            ttl=LOGIN_FAIL_CACHE_TTL_SECONDS,
            is_json=False,
        )
    except Exception as e:
        logger.warning("Failed to update login fail IP counter key=%s: %s", key, e)
    return count


async def clear_login_fail_ip_count(*, audience: str, ip: str):
    from infrastructure.cache_manager import cache
    key = login_fail_ip_cache_key(audience=audience, ip=ip)
    try:
        await cache.delete(key)
    except Exception as e:
        logger.warning("Failed to clear login fail IP counter key=%s: %s", key, e)


async def is_ip_locked(*, audience: str, ip: str) -> bool:
    from infrastructure.cache_manager import cache
    key = login_lock_ip_cache_key(audience=audience, ip=ip)
    try:
        raw = await cache.get(key, is_json=False)
        return raw is not None
    except Exception as e:
        logger.warning("Failed to read IP lock key=%s: %s", key, e)
        return False


async def set_ip_lock(*, audience: str, ip: str, duration_minutes: int):
    from infrastructure.cache_manager import cache
    key = login_lock_ip_cache_key(audience=audience, ip=ip)
    ttl_seconds = max(60, int(duration_minutes) * 60)
    lock_until = int(datetime.now(timezone.utc).timestamp()) + ttl_seconds
    try:
        await cache.set(key, str(lock_until), ttl=ttl_seconds, is_json=False)
    except Exception as e:
        logger.warning("Failed to write IP lock key=%s: %s", key, e)


async def clear_ip_lock(*, audience: str, ip: str):
    from infrastructure.cache_manager import cache
    key = login_lock_ip_cache_key(audience=audience, ip=ip)
    try:
        await cache.delete(key)
    except Exception as e:
        logger.warning("Failed to clear IP lock key=%s: %s", key, e)
