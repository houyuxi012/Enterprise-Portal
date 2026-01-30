from fastapi import FastAPI
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

# Mount uploads directory to serve static files
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# CORS middleware to allow calls from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
    ],
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

# Include Routers
app.include_router(employees.router)
app.include_router(news.router)
app.include_router(tools.router)
app.include_router(announcements.router)
app.include_router(ai.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(upload.router)
app.include_router(system.router)
app.include_router(roles.router)
app.include_router(departments.router)
app.include_router(logs.router)

app.include_router(carousel.router)
app.include_router(dashboard.router)
