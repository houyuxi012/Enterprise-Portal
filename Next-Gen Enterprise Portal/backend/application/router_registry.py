from __future__ import annotations

from fastapi import APIRouter

from application.admin_routes import build_admin_router
from application.iam_routes import build_iam_router
from application.portal_routes import build_portal_router
from modules.portal.routers.upload import _FILE_ROUTER as file_proxy_router


def register_api_routes(api_router: APIRouter) -> None:
    api_router.include_router(build_iam_router())
    api_router.include_router(build_portal_router())
    api_router.include_router(build_admin_router())
    # File proxy download: /api/files/{token} (shared by portal & admin)
    api_router.include_router(file_proxy_router)


def build_api_router() -> APIRouter:
    api_router = APIRouter(prefix="/api")
    register_api_routes(api_router)
    return api_router
