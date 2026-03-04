from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import utils
from core.startup import register_startup_events
from middleware.access_logging import AccessLoggingMiddleware
from middleware.license_gate import LicenseGateMiddleware
from middleware.logging import SystemLoggingMiddleware
from middleware.trace_context import TraceContextMiddleware
from modules.admin.router import router as admin_router
from modules.iam.router import router as iam_router
from modules.portal.router import router as portal_router


def create_app() -> FastAPI:
    app = FastAPI(title="ShiKu Portal API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=utils.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SystemLoggingMiddleware)
    app.add_middleware(TraceContextMiddleware)
    app.add_middleware(LicenseGateMiddleware)
    app.add_middleware(AccessLoggingMiddleware)

    api_router = APIRouter(prefix="/api")
    api_router.include_router(iam_router)
    api_router.include_router(portal_router)
    api_router.include_router(admin_router)
    app.include_router(api_router)

    register_startup_events(app)

    @app.get("/")
    def read_root():
        return {"message": "Welcome to ShiKu Portal API"}

    return app


app = create_app()

