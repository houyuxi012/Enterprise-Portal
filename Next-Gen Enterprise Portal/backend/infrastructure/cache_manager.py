import os
import logging
import time
import asyncio
from typing import Optional, Any, Union, Dict, List, Tuple
import redis.asyncio as redis
from fastapi_limiter import FastAPILimiter
from core.runtime_secrets import get_env

# 1) JSON Fallback Update: Must decode bytes before loads
try:
    import orjson as json_lib
    def serialize(obj: Any) -> bytes:
        return json_lib.dumps(obj)
    def deserialize(obj: bytes) -> Any:
        return json_lib.loads(obj)
except ImportError:
    import json as json_lib
    def serialize(obj: Any) -> bytes:
        return json_lib.dumps(obj).encode('utf-8')
    def deserialize(obj: bytes) -> Any:
        return json_lib.loads(obj.decode('utf-8'))

logger = logging.getLogger(__name__)

class CacheManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CacheManager, cls).__new__(cls)
            cls._instance.redis: Optional[redis.Redis] = None
            cls._instance.redis_limiter: Optional[redis.Redis] = None # 2) Separate client for Limiter
            
            # Memory Cache: Store (value_bytes, expire_at_float)
            cls._instance.memory_cache: Dict[str, Tuple[bytes, float]] = {} 
            cls._instance.is_redis_available = False
            cls._instance.strict_mode = str(os.getenv("CACHE_STRICT_MODE", "true")).lower() != "false"
            cls._instance.allow_memory_fallback = not cls._instance.strict_mode
            
            # 4) & 5) Lock for thread/coroutine safety (memory + stats)
            cls._instance._lock = None 
            
            # Metrics
            cls._instance.hits = 0
            cls._instance.misses = 0
            cls._instance.ops_stats = {
                "get": {"count": 0, "total_ms": 0.0},
                "mget": {"count": 0, "total_ms": 0.0},
                "set": {"count": 0, "total_ms": 0.0}
            }
        return cls._instance

    def _ensure_lock(self):
        """Ensure lock exists before use (FastAPI single-process safe)"""
        if self._lock is None:
            self._lock = asyncio.Lock()

    async def init(self, redis_url: str = None, 
                   max_connections: int = 100, 
                   socket_timeout: float = 5.0, 
                   socket_connect_timeout: float = 2.0, 
                   health_check_interval: int = 30):
        
        # Initialize Lock
        self._ensure_lock()
        self.strict_mode = str(os.getenv("CACHE_STRICT_MODE", "true")).lower() != "false"
        self.allow_memory_fallback = not self.strict_mode

        if not redis_url:
            redis_url = get_env("REDIS_URL")

        if redis_url.startswith("redis://"):
            message = "REDIS_URL uses plaintext transport (redis://). Configure rediss:// for secure deployment."
            if self.strict_mode:
                raise RuntimeError(message)
            logger.warning(message)
        if "ssl_cert_reqs=none" in redis_url.lower():
            message = "REDIS_URL disables certificate verification (ssl_cert_reqs=none)."
            if self.strict_mode:
                raise RuntimeError(message)
            logger.warning(message)
        if "@" not in redis_url:
            logger.warning("REDIS_URL appears to have no password configured.")
            
        if redis_url:
            try:
                # Client 1: Cache (Bytes Mode)
                self.redis = redis.from_url(
                    redis_url, 
                    encoding="utf-8", 
                    decode_responses=False, 
                    max_connections=max_connections,
                    socket_timeout=socket_timeout,
                    socket_connect_timeout=socket_connect_timeout,
                    health_check_interval=health_check_interval
                )
                
                # Client 2: Limiter (String Mode) - 2) Separate client
                self.redis_limiter = redis.from_url(
                    redis_url, 
                    encoding="utf-8", 
                    decode_responses=True, 
                    max_connections=20, # Smaller pool for limiter
                    socket_timeout=socket_timeout,
                    socket_connect_timeout=socket_connect_timeout
                )

                # Test connections
                await self.redis.ping()
                await self.redis_limiter.ping()
                
                self.is_redis_available = True
                
                # Init Rate Limiter with String Client
                await FastAPILimiter.init(self.redis_limiter)
                logger.info(f"✅ Redis Cache Initialized: {redis_url} (Pools: Bytes={max_connections}, Str=20)")
            except Exception as e:
                logger.warning("⚠️ Redis Connection Failed: %s", e)
                self.redis = None
                self.redis_limiter = None
                self.is_redis_available = False
                if self.strict_mode:
                    raise RuntimeError("Redis connection failed and CACHE_STRICT_MODE=true.") from e
                logger.warning("Falling back to In-Memory Cache because CACHE_STRICT_MODE=false.")
        else:
            if self.strict_mode:
                raise RuntimeError("REDIS_URL is required when CACHE_STRICT_MODE=true.")
            logger.info("ℹ️ No REDIS_URL found. Using In-Memory Cache.")

    def _ensure_backend_ready(self) -> None:
        if self.strict_mode and not (self.is_redis_available and self.redis):
            raise RuntimeError("Redis backend is unavailable and in-memory fallback is disabled.")

    def _mem_get_locked(self, key: str) -> Optional[bytes]:
        """Internal memory get assuming lock is held"""
        item = self.memory_cache.get(key)
        if not item:
            return None
        val, expire_at = item
        if time.time() > expire_at:
            del self.memory_cache[key]
            return None
        return val

    async def get(self, key: str, is_json: bool = True) -> Any:
        self._ensure_lock()
        start = time.perf_counter()
        val = None
        hit = False
        self._ensure_backend_ready()
        try:
            if self.is_redis_available and self.redis:
                val = await self.redis.get(key)
            elif self.allow_memory_fallback:
                async with self._lock:
                    val = self._mem_get_locked(key)
            else:
                raise RuntimeError("Redis backend unavailable.")
            
            if val is not None:
                hit = True
                return deserialize(val) if is_json else val
            else:
                return None
        except Exception as e:
            if self.strict_mode:
                raise
            logger.error(f"Cache GET error: {e}")
            return None
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            async with self._lock:
                if hit:
                    self.hits += 1
                else:
                    self.misses += 1
                
                s = self.ops_stats["get"]
                s["count"] += 1
                s["total_ms"] += elapsed

    async def mget(self, keys: List[str], is_json: bool = True) -> Dict[str, Any]:
        self._ensure_lock()
        if not keys:
            return {}
        self._ensure_backend_ready()
        
        start = time.perf_counter()
        result = {}
        hits_delta = 0
        misses_delta = 0
        
        try:
            if self.is_redis_available and self.redis:
                values = await self.redis.mget(keys)
                for key, val in zip(keys, values):
                    if val is not None:
                        hits_delta += 1
                        result[key] = deserialize(val) if is_json else val
                    else:
                        misses_delta += 1
                        result[key] = None
            elif self.allow_memory_fallback:
                async with self._lock:
                    for key in keys:
                        val = self._mem_get_locked(key)
                        if val is not None:
                            hits_delta += 1
                            result[key] = deserialize(val) if is_json else val
                        else:
                            misses_delta += 1
                            result[key] = None
            else:
                raise RuntimeError("Redis backend unavailable.")
            return result
        except Exception as e:
            if self.strict_mode:
                raise
            logger.error(f"Cache MGET error: {e}")
            return {}
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            async with self._lock:
                self.hits += hits_delta
                self.misses += misses_delta
                s = self.ops_stats["mget"]
                s["count"] += 1
                s["total_ms"] += elapsed

    async def set(self, key: str, value: Any, ttl: int = 60, is_json: bool = True):
        self._ensure_lock()
        start = time.perf_counter()
        self._ensure_backend_ready()
        try:
            if is_json:
                data = serialize(value)
            else:
                if isinstance(value, str):
                    data = value.encode('utf-8')
                elif isinstance(value, bytes):
                    data = value
                else:
                    raise ValueError("Raw mode requires bytes or str")

            if self.is_redis_available and self.redis:
                await self.redis.set(key, data, ex=ttl)
            elif self.allow_memory_fallback:
                async with self._lock:
                    expire_at = time.time() + ttl
                    self.memory_cache[key] = (data, expire_at)
            else:
                raise RuntimeError("Redis backend unavailable.")
        except Exception as e:
            if self.strict_mode:
                raise
            logger.error(f"Cache SET error: {e}")
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            async with self._lock:
                s = self.ops_stats["set"]
                s["count"] += 1
                s["total_ms"] += elapsed

    async def delete(self, key: str):
        self._ensure_lock()
        self._ensure_backend_ready()
        try:
            if self.is_redis_available and self.redis:
                await self.redis.delete(key)
            elif self.allow_memory_fallback:
                async with self._lock:
                    self.memory_cache.pop(key, None)
            else:
                raise RuntimeError("Redis backend unavailable.")
        except Exception as e:
            if self.strict_mode:
                raise
            logger.error(f"Cache DELETE error: {e}")

    async def delete_pattern(self, pattern: str):
        self._ensure_lock()
        self._ensure_backend_ready()
        try:
            if self.is_redis_available and self.redis:
                batch_size = 1000
                batch_keys = []
                # Redis Bytes mode requires bytes match pattern
                b_pattern = pattern.encode('utf-8')
                
                async for key in self.redis.scan_iter(match=b_pattern, count=1000):
                    batch_keys.append(key)
                    if len(batch_keys) >= batch_size:
                        await self.redis.delete(*batch_keys)
                        batch_keys = []
                if batch_keys:
                    await self.redis.delete(*batch_keys)
            elif self.allow_memory_fallback:
                async with self._lock:
                    prefix = pattern.rstrip("*")
                    keys_to_del = [k for k in self.memory_cache.keys() if k.startswith(prefix)]
                    for k in keys_to_del:
                        del self.memory_cache[k]
            else:
                raise RuntimeError("Redis backend unavailable.")
        except Exception as e:
            if self.strict_mode:
                raise
            logger.error(f"Cache DELETE PATTERN error: {e}")

    async def get_stats(self):
        self._ensure_lock()
        async with self._lock:
            total_ops = self.hits + self.misses
            hit_rate = (self.hits / total_ops) * 100 if total_ops > 0 else 0
            
            def avg(op):
                s = self.ops_stats[op]
                return round(s["total_ms"] / s["count"], 2) if s["count"] > 0 else 0.0

            return {
                "backend": "redis" if self.is_redis_available else "memory",
                "hits": self.hits, 
                "misses": self.misses, 
                "hit_rate": f"{hit_rate:.2f}%",
                "avg_get_ms": avg("get"),
                "avg_mget_ms": avg("mget"),
                "avg_set_ms": avg("set")
            }

    async def close(self):
        if self.redis:
            await self.redis.close()
        if self.redis_limiter:
            await self.redis_limiter.close()

# Global Instance
cache = CacheManager()
