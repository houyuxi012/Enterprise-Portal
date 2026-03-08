"""
Session Manager - 会话生命周期管理

从 IdentityService 拆分而来，包含活跃会话的 ZSET 管理、JTI 黑名单、
会话清理、Token 撤销等方法。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class SessionStateStoreError(RuntimeError):
    """Raised when session revocation state cannot be safely read or written."""


# ── 常量 ──
REVOKED_JTI_PREFIX = "iam:revoked:jti:"
SESSION_ZSET_PREFIX = "iam:sessions"
LEGACY_ACTIVE_SESSION_PREFIX = "iam:active_sessions"
SESSION_TTL_BUFFER_SECONDS = 30


def revoked_jti_cache_key(jti: str) -> str:
    return f"{REVOKED_JTI_PREFIX}{jti}"


def session_zset_key(*, audience: str, user_id: int) -> str:
    aud = (audience or "unknown").strip().lower() or "unknown"
    return f"{SESSION_ZSET_PREFIX}:{aud}:{user_id}"


def legacy_active_session_key(*, audience: str, user_id: int) -> str:
    aud = (audience or "unknown").strip().lower() or "unknown"
    return f"{LEGACY_ACTIVE_SESSION_PREFIX}:{user_id}:{aud}"


def session_key_ttl_seconds(session_timeout_minutes: int) -> int:
    return max(60, int(session_timeout_minutes) * 60 + SESSION_TTL_BUFFER_SECONDS)


def normalize_memory_sessions(raw: Any) -> dict[str, int]:
    from iam.identity.token_service import normalize_jti, exp_to_epoch

    sessions: dict[str, int] = {}
    pairs: list[tuple[Any, Any]] = []
    if isinstance(raw, dict):
        pairs = list(raw.items())
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                pairs.append((item[0], item[1]))
            elif isinstance(item, dict):
                pairs.append((item.get("jti"), item.get("exp")))

    for raw_jti, raw_exp in pairs:
        jti = normalize_jti(raw_jti)
        exp_epoch = exp_to_epoch(raw_exp)
        if jti and exp_epoch is not None:
            sessions[jti] = int(exp_epoch)
    return sessions


def resolve_audiences(scope: str | None) -> list[str]:
    normalized = (scope or "all").strip().lower()
    if normalized in {"admin", "portal"}:
        return [normalized]
    return ["admin", "portal"]


def parse_user_id_from_session_key(key: str) -> int | None:
    if not key:
        return None
    parts = key.split(":")
    if len(parts) < 4:
        return None
    raw_user_id = parts[-1]
    if not raw_user_id.isdigit():
        return None
    return int(raw_user_id)


async def list_session_keys_for_audience(audience: str) -> list[str]:
    from infrastructure.cache_manager import cache

    prefix = f"{SESSION_ZSET_PREFIX}:{audience}:"
    redis_client = cache.redis if cache.is_redis_available and cache.redis else None
    keys: list[str] = []

    if redis_client:
        pattern = f"{prefix}*"
        try:
            async for raw_key in redis_client.scan_iter(match=pattern.encode("utf-8"), count=200):
                if isinstance(raw_key, bytes):
                    keys.append(raw_key.decode("utf-8", errors="ignore"))
                else:
                    keys.append(str(raw_key))
            return keys
        except Exception as e:
            logger.warning("Failed to scan online session keys pattern=%s: %s", pattern, e)

    cache._ensure_lock()  # type: ignore[attr-defined]
    async with cache._lock:  # type: ignore[attr-defined]
        for cache_key in cache.memory_cache.keys():
            if isinstance(cache_key, str) and cache_key.startswith(prefix):
                keys.append(cache_key)
    return keys


async def revoke_jti_until_expiry(jti: str | None, exp_epoch: int | None) -> bool:
    from iam.identity.token_service import normalize_jti, exp_to_epoch
    from infrastructure.cache_manager import cache

    normalized_jti = normalize_jti(jti)
    normalized_exp = exp_to_epoch(exp_epoch)
    if not normalized_jti or normalized_exp is None:
        return False

    ttl = max(1, int(normalized_exp) - int(datetime.now(timezone.utc).timestamp()))
    try:
        await cache.set(
            revoked_jti_cache_key(normalized_jti),
            "1",
            ttl=ttl,
            is_json=False,
        )
        return True
    except Exception as e:
        logger.error("Failed to add token jti=%s into denylist: %s", normalized_jti, e)
        raise SessionStateStoreError(
            f"Failed to persist revoked token state for jti={normalized_jti}"
        ) from e


async def is_jti_revoked(jti: str | None) -> bool:
    if not jti:
        return True
    from infrastructure.cache_manager import cache
    try:
        revoked = await cache.get(revoked_jti_cache_key(jti), is_json=False)
        return revoked is not None
    except Exception as e:
        logger.error("Failed to check token denylist for jti=%s: %s", jti, e)
        raise SessionStateStoreError(f"Failed to read revoked token state for jti={jti}") from e


async def cleanup_expired_sessions(
    *,
    user_id: int,
    audience: str,
    session_timeout_minutes: int,
) -> int:
    from infrastructure.cache_manager import cache

    now_epoch = int(datetime.now(timezone.utc).timestamp())
    ttl_seconds = session_key_ttl_seconds(session_timeout_minutes)
    sk = session_zset_key(audience=audience, user_id=user_id)
    lk = legacy_active_session_key(audience=audience, user_id=user_id)
    redis_client = cache.redis if cache.is_redis_available and cache.redis else None

    if redis_client:
        try:
            await redis_client.zremrangebyscore(sk, "-inf", now_epoch)
            active_count = int(await redis_client.zcard(sk))
            if active_count > 0:
                await redis_client.expire(sk, ttl_seconds)
            else:
                await redis_client.delete(sk)
            await cache.delete(lk)
            return active_count
        except Exception as e:
            logger.warning("Session ZSET cleanup failed for key=%s: %s", sk, e)

    raw_sessions = await cache.get(sk)
    if raw_sessions is None:
        raw_sessions = await cache.get(lk)
    sessions = normalize_memory_sessions(raw_sessions)
    valid_sessions: dict[str, int] = {}
    for session_jti, exp_epoch_val in sessions.items():
        if exp_epoch_val > now_epoch and not await is_jti_revoked(session_jti):
            valid_sessions[session_jti] = exp_epoch_val

    if valid_sessions:
        await cache.set(sk, valid_sessions, ttl=ttl_seconds)
    else:
        await cache.delete(sk)
    await cache.delete(lk)
    return len(valid_sessions)


async def add_active_session(
    *,
    user_id: int,
    audience: str,
    jti: str | None,
    exp_epoch: int | None,
    session_timeout_minutes: int,
):
    from iam.identity.token_service import normalize_jti, exp_to_epoch
    from infrastructure.cache_manager import cache

    normalized_jti = normalize_jti(jti)
    normalized_exp = exp_to_epoch(exp_epoch)
    if not normalized_jti or normalized_exp is None:
        return

    now_epoch = int(datetime.now(timezone.utc).timestamp())
    if normalized_exp <= now_epoch:
        return

    ttl_seconds = session_key_ttl_seconds(session_timeout_minutes)
    sk = session_zset_key(audience=audience, user_id=user_id)
    lk = legacy_active_session_key(audience=audience, user_id=user_id)
    redis_client = cache.redis if cache.is_redis_available and cache.redis else None

    if redis_client:
        try:
            await redis_client.zadd(sk, {normalized_jti: float(normalized_exp)})
            await redis_client.zremrangebyscore(sk, "-inf", now_epoch)
            await redis_client.expire(sk, ttl_seconds)
            await cache.delete(lk)
            return
        except Exception as e:
            logger.warning("Failed to add active session to ZSET key=%s: %s", sk, e)

    raw_sessions = await cache.get(sk)
    if raw_sessions is None:
        raw_sessions = await cache.get(lk)
    sessions = normalize_memory_sessions(raw_sessions)
    sessions[normalized_jti] = int(normalized_exp)
    sessions = {
        session_jti: session_exp
        for session_jti, session_exp in sessions.items()
        if session_exp > now_epoch and not await is_jti_revoked(session_jti)
    }
    if sessions:
        await cache.set(sk, sessions, ttl=ttl_seconds)
    else:
        await cache.delete(sk)
    await cache.delete(lk)


async def remove_active_session(
    *,
    user_id: int | None,
    audience: str | None,
    jti: str | None,
):
    if not user_id or not audience or not jti:
        return
    from iam.identity.token_service import normalize_jti, normalize_audience_claim
    from infrastructure.cache_manager import cache

    normalized_jti = normalize_jti(jti)
    normalized_audience = normalize_audience_claim(audience)
    if not normalized_jti or not normalized_audience:
        return

    sk = session_zset_key(audience=normalized_audience, user_id=user_id)
    lk = legacy_active_session_key(audience=normalized_audience, user_id=user_id)
    redis_client = cache.redis if cache.is_redis_available and cache.redis else None

    if redis_client:
        try:
            await redis_client.zrem(sk, normalized_jti)
            await cache.delete(lk)
            return
        except Exception as e:
            logger.warning("Failed to remove active session from ZSET key=%s: %s", sk, e)

    raw_sessions = await cache.get(sk)
    if raw_sessions is None:
        raw_sessions = await cache.get(lk)
    sessions = normalize_memory_sessions(raw_sessions)
    if normalized_jti in sessions:
        sessions.pop(normalized_jti, None)
        if sessions:
            now_epoch = int(datetime.now(timezone.utc).timestamp())
            max_exp = max(int(ep) for ep in sessions.values())
            ttl_seconds = max(
                60,
                max_exp - now_epoch + SESSION_TTL_BUFFER_SECONDS,
            )
            await cache.set(sk, sessions, ttl=ttl_seconds)
        else:
            await cache.delete(sk)
    await cache.delete(lk)


async def revoke_all_sessions_for_user(*, user_id: int, audience: str) -> int:
    from iam.identity.token_service import normalize_jti, exp_to_epoch
    from infrastructure.cache_manager import cache

    sk = session_zset_key(audience=audience, user_id=user_id)
    lk = legacy_active_session_key(audience=audience, user_id=user_id)
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    revoked_count = 0
    redis_client = cache.redis if cache.is_redis_available and cache.redis else None

    if redis_client:
        try:
            await redis_client.zremrangebyscore(sk, "-inf", now_epoch)
            entries = await redis_client.zrange(sk, 0, -1, withscores=True)
            for member, score in entries:
                member_jti = normalize_jti(member)
                member_exp = exp_to_epoch(score)
                if await revoke_jti_until_expiry(member_jti, member_exp):
                    revoked_count += 1
            await redis_client.delete(sk)
            await cache.delete(lk)
            return revoked_count
        except SessionStateStoreError:
            raise
        except Exception as e:
            logger.warning("Failed to revoke all sessions for key=%s: %s", sk, e)

    raw_sessions = await cache.get(sk)
    if raw_sessions is None:
        raw_sessions = await cache.get(lk)
    sessions = normalize_memory_sessions(raw_sessions)
    for session_jti, session_exp in sessions.items():
        if session_exp > now_epoch and await revoke_jti_until_expiry(session_jti, session_exp):
            revoked_count += 1
    await cache.delete(sk)
    await cache.delete(lk)
    return revoked_count


async def revoke_token(
    token: str | None,
    *,
    db=None,
):
    if not token:
        return
    from iam.identity.token_service import extract_token_session_meta

    user_id, audience, jti, exp_ts = await extract_token_session_meta(token, db=db)
    if not jti or exp_ts is None:
        return
    await revoke_jti_until_expiry(jti, exp_ts)
    await remove_active_session(
        user_id=user_id,
        audience=audience,
        jti=jti,
    )
