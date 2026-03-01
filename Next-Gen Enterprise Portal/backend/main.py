import asyncio
import fcntl
import logging
import os
import time
from pathlib import Path

import database
import models
import schemas
from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from iam.deps import verify_admin_aud, verify_portal_aud
from routers import (
    ai,
    announcements,
    auth,
    captcha,
    carousel,
    dashboard,
    departments,
    employees,
    logs,
    news,
    notifications,
    portal_auth,
    public,
    session,
    system,
    tools,
    upload,
)
from routers.iam_directories import router as iam_directory_router

app = FastAPI(title="ShiKu Portal API", version="1.0.0")
logger = logging.getLogger(__name__)

_BOOT_ID = str(os.getppid())
_STARTUP_READY_WAIT_SECONDS = int(os.getenv("STARTUP_READY_WAIT_SECONDS", "180"))
_STARTUP_READY_PATH = Path(f"/tmp/enterprise_portal_startup.ready.{_BOOT_ID}")
_STARTUP_LEADER_LOCK_PATH = Path(f"/tmp/enterprise_portal_startup.leader.{_BOOT_ID}.lock")
_STARTUP_LEADER_FD = None
_LEADER_TASKS = []


def _acquire_startup_leader_lock() -> bool:
    """Elect one worker as startup leader within current gunicorn master lifecycle."""
    global _STARTUP_LEADER_FD
    _STARTUP_LEADER_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(_STARTUP_LEADER_LOCK_PATH), os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return False
    _STARTUP_LEADER_FD = fd
    return True


def _mark_startup_ready() -> None:
    _STARTUP_READY_PATH.write_text(str(int(time.time())), encoding="utf-8")


async def _wait_for_startup_ready(timeout_seconds: int) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if _STARTUP_READY_PATH.exists():
            return True
        await asyncio.sleep(0.2)
    return False


async def _run_shared_startup_initialization() -> None:
    """Run idempotent schema/init tasks once per master startup."""
    from database import init_pgvector
    from test_db.rbac_init import init_rbac

    await init_pgvector()
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    await database.apply_startup_migrations()

    async with database.SessionLocal() as session:
        await init_rbac(session)

@app.on_event("startup")
async def startup():
    is_startup_leader = _acquire_startup_leader_lock()

    # Cache client is process-local, initialize for each worker.
    from services.cache_manager import cache
    await cache.init()

    # One-time startup DDL/init to avoid multi-worker startup deadlocks.
    if is_startup_leader:
        try:
            await _run_shared_startup_initialization()
            _mark_startup_ready()
            logger.info("Startup leader initialization completed (boot_id=%s).", _BOOT_ID)
        except Exception as e:
            logger.warning("Startup leader initialization failed: %s", e)
            raise
    else:
        ready = await _wait_for_startup_ready(_STARTUP_READY_WAIT_SECONDS)
        if not ready:
            logger.warning(
                "Startup readiness wait timed out (%ss). Running fallback shared init locally.",
                _STARTUP_READY_WAIT_SECONDS,
            )
            await _run_shared_startup_initialization()
        else:
            logger.info("Startup follower observed readiness marker (boot_id=%s).", _BOOT_ID)

    # --- Initialize LogSink (Loki Sidecar) ---
    from services.log_sink import init_log_sink
    loki_url = os.getenv("LOKI_PUSH_URL")  # e.g., http://loki:3100
    # DbSink is handled within AuditService, so we pass an async no-op here.
    # The actual DB write is still managed by AuditService directly.
    async def noop_db_write(entry): return True
    init_log_sink(db_write_func=noop_db_write, loki_url=loki_url)
    
    # --- Initialize LogRepository (Unified Abstraction Layer) ---
    from services.log_repository import init_log_repository
    init_log_repository(db_session_factory=database.SessionLocal, loki_url=loki_url)

    # --- Initialize AI Audit Writer (DB + Loki dual-write) ---
    from services.ai_audit_writer import init_ai_audit_writer
    loki_enabled = bool(loki_url)
    init_ai_audit_writer(
        db_session_factory=database.SessionLocal, 
        loki_enabled=loki_enabled, 
        loki_url=loki_url or "http://loki:3100"
    )

    # Leader-only background schedulers.
    if is_startup_leader:
        from services.directory_sync_scheduler import DirectorySyncScheduler
        from services.iam_archiver import IAMAuditArchiver
        from services.log_storage import run_log_cleanup_scheduler

        _LEADER_TASKS.append(asyncio.create_task(run_log_cleanup_scheduler(database.SessionLocal)))
        _LEADER_TASKS.append(asyncio.create_task(IAMAuditArchiver.run_archiving_job()))
        _LEADER_TASKS.append(asyncio.create_task(DirectorySyncScheduler.run_scheduler(database.SessionLocal)))

        try:
            from routers.system import check_version_upgrade

            _LEADER_TASKS.append(asyncio.create_task(check_version_upgrade(database.SessionLocal)))
        except Exception as e:
            logger.warning("Startup version check scheduling failed: %s", e)
    else:
        logger.info("Skipping leader-only schedulers in follower worker.")


@app.on_event("shutdown")
async def shutdown():
    for task in _LEADER_TASKS:
        task.cancel()
    _LEADER_TASKS.clear()

    from services.log_sink import shutdown_log_sink
    await shutdown_log_sink()
    from services.log_repository import shutdown_log_repository
    await shutdown_log_repository()

# Mount uploads directory (REMOVED: Moved to authenticated endpoint)
# os.makedirs("uploads", exist_ok=True)
# app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# CORS middleware to allow calls from frontend
# CORS middleware to allow calls from frontend
import utils
app.add_middleware(
    CORSMiddleware,
    allow_origins=utils.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging Middleware
from middleware.logging import SystemLoggingMiddleware
app.add_middleware(SystemLoggingMiddleware)

# Trace Context Middleware (X-Request-ID propagation)
from middleware.trace_context import TraceContextMiddleware
app.add_middleware(TraceContextMiddleware)

# Global License Gate Middleware (block/unlock/read-only by license status)
from middleware.license_gate import LicenseGateMiddleware
app.add_middleware(LicenseGateMiddleware)

# Access Logging Middleware (HTTP logs to Loki only)
from middleware.access_logging import AccessLoggingMiddleware
app.add_middleware(AccessLoggingMiddleware)

@app.get("/")
def read_root():
    return {"message": "Welcome to ShiKu Portal API"}

# Create Main API Router with Prefix
# Create Main API Router with Prefix
api_router = APIRouter(prefix="/api")

# ===========================
# 3. Router Registration
# ===========================

# 3.1 Global/Public Routers (No Audience Check)
# IAM Router (Auth, Token, Audit)
from iam import router as iam_router
api_router.include_router(iam_router)
api_router.include_router(iam_directory_router, prefix="/iam")
api_router.include_router(portal_auth.router)
api_router.include_router(public.router)
api_router.include_router(captcha.router)
api_router.include_router(session.router)
# Admin-audience alias route required by license API contract: /api/system/license/*
api_router.include_router(system.license_alias_router, dependencies=[Depends(verify_admin_aud)])

# 3.2 App Routers (Audience: portal)
app_router = APIRouter(prefix="/app", dependencies=[Depends(verify_portal_aud)])

from routers import todos, ai_admin, kb, admin_tasks
# Standard App Routers
app_router.include_router(todos.router)
app_router.include_router(ai.router)
app_router.include_router(kb.router) 
app_router.include_router(upload.router)  # Portal uploads
app_router.include_router(logs.app_event_router)  # Portal business behavior logs
app_router.include_router(employees.app_router)  # Portal employee directory
app_router.include_router(notifications.router)
# Shared Resources (Accessible by Portal)
app_router.include_router(news.router)
app_router.include_router(announcements.router)
app_router.include_router(tools.router)
app_router.include_router(carousel.router) 

# 3.3 Admin Routers (Audience: admin)
admin_router = APIRouter(prefix="/admin", dependencies=[Depends(verify_admin_aud)])

# Admin Specific Routers
admin_router.include_router(dashboard.router)
admin_router.include_router(system.router)
admin_router.include_router(employees.router)
admin_router.include_router(departments.router)
admin_router.include_router(logs.router)
admin_router.include_router(ai_admin.router)
admin_router.include_router(admin_tasks.router)
admin_router.include_router(kb.router)  # KB management in admin plane
admin_router.include_router(notifications.router)
admin_router.include_router(notifications.admin_router)
# Shared Resources (Manageable by Admin)
admin_router.include_router(news.router)
admin_router.include_router(announcements.router)
admin_router.include_router(tools.router)
admin_router.include_router(carousel.router)
admin_router.include_router(upload.router) # Admin uploads

# Mount App and Admin routers
api_router.include_router(app_router)
api_router.include_router(admin_router)

# Legacy / Flat Support
# api_router.include_router(auth.router) # Old auth, deprecated

# Include API Router in App
app.include_router(api_router)
