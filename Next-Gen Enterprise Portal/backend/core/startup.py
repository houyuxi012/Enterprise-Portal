from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime

from fastapi import FastAPI
from sqlalchemy import text

import core.database as database
from core.migrations import ensure_db_schema_is_current, run_db_migrations, should_run_migrations_on_startup

logger = logging.getLogger(__name__)

_BOOT_ID = str(os.getppid())
_INSTANCE_ID = str(uuid.uuid4())
_LEADER_TASKS: list[asyncio.Task] = []
_STARTUP_LEADER_DB_CONN_ASYNC = None


async def try_acquire_db_startup_lock() -> bool:
    global _STARTUP_LEADER_DB_CONN_ASYNC
    try:
        import asyncpg

        url = database.engine.url
        raw_conn = await asyncpg.connect(
            user=url.username,
            password=url.password,
            database=url.database,
            host=url.host,
            port=url.port,
        )
        acquired = await raw_conn.fetchval("SELECT pg_try_advisory_lock(872341)")
        if acquired:
            _STARTUP_LEADER_DB_CONN_ASYNC = raw_conn
            return True
        await raw_conn.close()
        return False
    except Exception as e:
        logger.warning("DB advisory lock acquisition failed: %s", e)
        return False


async def _maintain_redis_startup_lock() -> None:
    from infrastructure.cache_manager import cache

    try:
        while True:
            await asyncio.sleep(60)
            client = getattr(cache, "redis", None)
            if client:
                await client.expire("enterprise_portal_startup_lock", 120)
    except asyncio.CancelledError:
        return
    except Exception as e:
        logger.warning("Redis lock maintainer failed: %s", e)


async def try_acquire_redis_startup_lock() -> bool:
    from infrastructure.cache_manager import cache

    try:
        client = getattr(cache, "redis", None)
        if not client:
            await cache.init()
            client = getattr(cache, "redis", None)
        if not client:
            raise RuntimeError("CacheManager client is unavailable after init")
        acquired = await client.set(
            "enterprise_portal_startup_lock",
            _INSTANCE_ID,
            ex=120,
            nx=True,
        )
        if acquired:
            _LEADER_TASKS.append(asyncio.create_task(_maintain_redis_startup_lock()))
            return True
        return False
    except Exception as e:
        logger.warning("Redis fallback lock check failed: %s", e)
        return False


async def acquire_startup_leader() -> str | None:
    try:
        if await try_acquire_db_startup_lock():
            return "db"
    except Exception as e:
        logger.warning("DB advisory lock acquisition failed: %s", e)

    return None


async def record_startup_status(status: str, error: str | None = None) -> None:
    query = text(
        """
        INSERT INTO system_startup_status (boot_id, instance_id, status, started_at, error)
        VALUES (:boot_id, :instance_id, :status, :now, :error)
        ON CONFLICT (boot_id) DO UPDATE SET
            instance_id = EXCLUDED.instance_id,
            status = EXCLUDED.status,
            finished_at = CASE WHEN EXCLUDED.status IN ('leader_completed', 'failed') THEN EXCLUDED.started_at ELSE system_startup_status.finished_at END,
            error = EXCLUDED.error
        """
    )
    try:
        async with database.engine.begin() as conn:
            await conn.execute(
                query,
                {
                    "boot_id": _BOOT_ID,
                    "instance_id": _INSTANCE_ID,
                    "status": status,
                    "now": datetime.utcnow(),
                    "error": error,
                },
            )
    except Exception as e:
        logger.error("Failed to record startup status (will ignore): %s", e)


async def _run_shared_startup_initialization() -> None:
    from test_db.rbac_init import init_rbac

    if should_run_migrations_on_startup():
        await run_db_migrations()
    else:
        logger.info(
            "Skipping startup DB migrations (DB_AUTO_MIGRATE_ON_STARTUP=false); "
            "verifying schema revision only."
        )
        await ensure_db_schema_is_current()

    async with database.SessionLocal() as session:
        await init_rbac(session)


async def on_startup() -> None:
    from infrastructure.cache_manager import cache

    if not getattr(cache, "redis", None):
        await cache.init()

    leader_type = await acquire_startup_leader()
    is_startup_leader = leader_type is not None

    if is_startup_leader:
        try:
            await record_startup_status("leader_running")
            await _run_shared_startup_initialization()
            await record_startup_status("leader_completed")
            logger.info("Startup leader initialization completed via %s (boot_id=%s).", leader_type, _BOOT_ID)
        except Exception as e:
            await record_startup_status("failed", str(e))
            logger.error("Startup leader initialization failed: %s", e)
            raise
    else:
        await record_startup_status("follower")
        logger.info("Startup follower skipping shared initialization (boot_id=%s).", _BOOT_ID)

    from modules.portal.services.ai_audit_writer import init_ai_audit_writer
    from modules.admin.services.log_repository import init_log_repository
    from modules.admin.services.log_sink import init_log_sink

    loki_url = os.getenv("LOKI_PUSH_URL")

    async def noop_db_write(_entry):
        return True

    init_log_sink(db_write_func=noop_db_write, loki_url=loki_url)
    init_log_repository(db_session_factory=database.SessionLocal, loki_url=loki_url)
    init_ai_audit_writer(
        db_session_factory=database.SessionLocal,
        loki_enabled=bool(loki_url),
        loki_url=loki_url or "http://loki:3100",
    )

    if is_startup_leader:
        from modules.admin.routers.system import check_version_upgrade
        from modules.iam.services.directory_sync_scheduler import DirectorySyncScheduler
        from modules.iam.services.iam_archiver import IAMAuditArchiver
        from modules.admin.services.log_storage import run_log_cleanup_scheduler

        _LEADER_TASKS.append(asyncio.create_task(run_log_cleanup_scheduler(database.SessionLocal)))
        _LEADER_TASKS.append(asyncio.create_task(IAMAuditArchiver.run_archiving_job()))
        _LEADER_TASKS.append(asyncio.create_task(DirectorySyncScheduler.run_scheduler(database.SessionLocal)))
        try:
            _LEADER_TASKS.append(asyncio.create_task(check_version_upgrade(database.SessionLocal)))
        except Exception as e:
            logger.warning("Startup version check scheduling failed: %s", e)
    else:
        logger.info("Skipping leader-only schedulers in follower worker.")


async def on_shutdown() -> None:
    from modules.admin.services.log_repository import shutdown_log_repository
    from modules.admin.services.log_sink import shutdown_log_sink

    for task in _LEADER_TASKS:
        task.cancel()
    _LEADER_TASKS.clear()
    await shutdown_log_sink()
    await shutdown_log_repository()


def register_startup_events(app: FastAPI) -> None:
    app.add_event_handler("startup", on_startup)
    app.add_event_handler("shutdown", on_shutdown)
