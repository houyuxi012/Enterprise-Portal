from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.runtime_secrets import validate_required_envs

_required_envs = [
    "DATABASE_URL",
    "REDIS_URL",
    "SECRET_KEY",
    "MASTER_KEY",
    "BIND_PASSWORD_ENC_KEYS",
    "BIND_PASSWORD_ENC_ACTIVE_KID",
]
if str(os.getenv("STORAGE_TYPE") or "").strip().lower() == "minio":
    _required_envs.extend(
        [
            "MINIO_ENDPOINT",
            "MINIO_ACCESS_KEY",
            "MINIO_SECRET_KEY",
            "MINIO_BUCKET_NAME",
        ]
    )
validate_required_envs(_required_envs)

from core import security
from application import build_api_router
from core.startup import lifespan_context
from middleware.access_logging import AccessLoggingMiddleware
from middleware.license_gate import LicenseGateMiddleware
from middleware.logging import SystemLoggingMiddleware
from middleware.trace_context import TraceContextMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title="ShiKu Portal API", version="1.0.0", lifespan=lifespan_context)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=security.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(SystemLoggingMiddleware)
    app.add_middleware(TraceContextMiddleware)
    app.add_middleware(LicenseGateMiddleware)
    app.add_middleware(AccessLoggingMiddleware)

    app.include_router(build_api_router())

    @app.get("/")
    def read_root():
        return {"message": "Welcome to ShiKu Portal API"}

    return app


app = create_app()
