from fastapi import FastAPI, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import employees, news, tools, announcements, ai, auth, upload, system, departments, logs, carousel, dashboard, public
import os
import database
import models
import schemas
from iam.deps import verify_portal_aud, verify_admin_aud

app = FastAPI(title="ShiKu Portal API", version="1.0.0")

@app.on_event("startup")
async def startup():
    # Enable pgvector extension
    from database import init_pgvector
    await init_pgvector()

    # Create Tables
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    # Apply startup migrations/indexes for existing deployments
    try:
        await database.apply_startup_migrations()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Startup migrations skipped due to error: %s", e)
    
    # Init Cache (Redis / Memory) First
    from services.cache_manager import cache
    await cache.init()

    # Init RBAC
    from test_db.rbac_init import init_rbac
    async with database.SessionLocal() as session:
        await init_rbac(session)

    # Schedule Log Cleanup Task
    from services.log_storage import run_log_cleanup_scheduler
    import asyncio
    asyncio.create_task(run_log_cleanup_scheduler(database.SessionLocal))

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

    # Schedule IAM Audit Archiving Job
    from services.iam_archiver import IAMAuditArchiver
    asyncio.create_task(IAMAuditArchiver.run_archiving_job())

    # Version Audit Check
    try:
        from routers.system import check_version_upgrade
        # Run in background to avoid blocking startup
        asyncio.create_task(check_version_upgrade(database.SessionLocal))
    except Exception as e:
        print(f"Startup Version Check Failed: {e}")


@app.on_event("shutdown")
async def shutdown():
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
api_router.include_router(public.router)

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
