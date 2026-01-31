from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import employees, news, tools, announcements, ai, auth, users, upload, system, roles, departments, logs, carousel, dashboard
import os
import database
import models
import schemas

app = FastAPI(title="ShiKu Portal API", version="1.0.0")

@app.on_event("startup")
async def startup():
    # Create Tables
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
    
    # Init Cache (Redis / Memory) First
    from services.cache_manager import cache
    await cache.init()

    # Init RBAC
    from rbac_init import init_rbac
    async with database.SessionLocal() as session:
        await init_rbac(session)

    # Schedule Log Cleanup Task
    from services.log_storage import run_log_cleanup_scheduler
    import asyncio
    asyncio.create_task(run_log_cleanup_scheduler(database.SessionLocal))

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

@app.get("/")
def read_root():
    return {"message": "Welcome to ShiKu Portal API"}

# Create Main API Router with Prefix
api_router = APIRouter(prefix="/api")

# Include Routers into API Router
api_router.include_router(employees.router)
api_router.include_router(news.router)
api_router.include_router(tools.router)
api_router.include_router(announcements.router)
api_router.include_router(ai.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(upload.router)
api_router.include_router(system.router)
api_router.include_router(roles.router)
api_router.include_router(departments.router)
api_router.include_router(logs.router)
api_router.include_router(carousel.router)
api_router.include_router(dashboard.router)

from routers import ai_admin
api_router.include_router(ai_admin.router)

# Include API Router in App
app.include_router(api_router)
