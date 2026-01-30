
import asyncio
import logging
import sys
import os

# Add parent dir to path to import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.services.cache_manager import cache

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ProdCacheDemo")

LONG_TTL = 315360000 # 10 Years

async def get_data_version(user_id: int) -> int:
    """
    Get current data version for user.
    Strategy: 
    1. Try Redis GET (raw).
    2. If MISS, default to 1 (and SET to Redis).
    """
    ver_key = f"user_perm_ver:{user_id}"
    
    try:
        # CacheManager V4 uses decode_responses=False, so we likely get bytes
        ver = await cache.get(ver_key, is_json=False)
    except Exception:
        ver = None

    if ver is not None:
        # 1) Handle Bytes vs Str (Production Fix)
        if isinstance(ver, bytes):
            ver = ver.decode('utf-8')
        return int(ver)
    
    # Default Version = 1
    # 2) & 3) Version key should practically never expire (Use Long TTL)
    await cache.set(ver_key, "1", ttl=LONG_TTL, is_json=False) 
    return 1

async def get_user_context(user_id: int):
    """
    Simulate /auth/me: Fetch Permissions + Menu in one go to minimize RTT.
    """
    # 1. Get Version (1 RTT)
    version = await get_data_version(user_id)
    
    perm_key = f"perm:{user_id}:{version}"
    menu_key = f"menu:{user_id}:{version}"
    
    # 2. MGET Permissions & Menu (1 RTT)
    # Returns dict: {key: value or None}
    cached_data = await cache.mget([perm_key, menu_key])
    
    perms = cached_data.get(perm_key)
    menu = cached_data.get(menu_key)
    
    # 3. Check Hits (Strict check: is not None)
    if perms is not None and menu is not None:
        logger.info(f"⚡️ Cache HIT (Ver {version}): Got Perms & Menu")
        return {"permissions": perms, "menu": menu}
    
    # 4. Handle Misses (Refill)
    logger.info(f"🐢 Cache MISS (Ver {version}): Fetching from DB...")
    
    if perms is None:
        # Simulate DB fetch
        perms = ["sys:user:view", "sys:user:edit", "content:article:add"]
        await cache.set(perm_key, perms, ttl=3600)
        
    if menu is None:
        # Simulate DB fetch
        menu = [{"id": 1, "title": "Dashboard", "path": "/dashboard"}]
        await cache.set(menu_key, menu, ttl=3600)
        
    return {"permissions": perms, "menu": menu}

async def simulate_admin_change_permissions(user_id: int):
    """
    Admin Action: Change Role/Permissions -> Bump Version.
    This invalidates all previous keys (perm:uid:v1) lazily.
    """
    ver_key = f"user_perm_ver:{user_id}"
    
    if cache.is_redis_available and cache.redis:
        # Atomic INCR
        new_ver = await cache.redis.incr(ver_key)
        logger.info(f"🔄 Admin bumped version to: {new_ver}")
    else:
        # Memory Fallback (Simulate persistent version)
        current_raw = await cache.get(ver_key, is_json=False)
        if current_raw:
             if isinstance(current_raw, bytes):
                current_raw = current_raw.decode('utf-8')
             current_val = int(current_raw)
        else:
             current_val = 1
        
        new_ver = current_val + 1
        # 3) Memory update also needs Long TTL
        await cache.set(ver_key, str(new_ver), ttl=LONG_TTL, is_json=False)
        logger.info(f"🔄 [Memory] Admin bumped version to: {new_ver}")

async def main():
    # Init Cache (Auto-detects REDIS_URL)
    await cache.init()
    
    user_id = 1001
    
    print("\n=== Request 1: Cold Start ===")
    ctx1 = await get_user_context(user_id)
    print(f"Result: {len(ctx1['permissions'])} perms, {len(ctx1['menu'])} menus")
    
    print("\n=== Request 2: Hot Cache ===")
    ctx2 = await get_user_context(user_id)
    
    print("\n=== Admin Modifies Permissions ===")
    await simulate_admin_change_permissions(user_id)
    
    print("\n=== Request 3: Version Change -> Re-fetch ===")
    ctx3 = await get_user_context(user_id)
    
    print("\n=== Final Stats ===")
    # 4) get_stats is async in CacheManager V4
    stats = await cache.get_stats() 
    print(stats)
    
    await cache.close()

if __name__ == "__main__":
    asyncio.run(main())
