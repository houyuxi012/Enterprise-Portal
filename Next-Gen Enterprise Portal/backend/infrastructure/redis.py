"""
Redis infrastructure adapter.
"""

from infrastructure.cache_manager import cache


async def get_redis_client():
    if not getattr(cache, "redis", None):
        await cache.init()
    return cache.redis
