from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import utils
from application import build_api_router
from core.startup import register_startup_events
from middleware.access_logging import AccessLoggingMiddleware
from middleware.license_gate import LicenseGateMiddleware
from middleware.logging import SystemLoggingMiddleware
from middleware.trace_context import TraceContextMiddleware


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

    app.include_router(build_api_router())

    register_startup_events(app)

    @app.get("/")
    def read_root():
        return {"message": "Welcome to ShiKu Portal API"}

    return app


app = create_app()
