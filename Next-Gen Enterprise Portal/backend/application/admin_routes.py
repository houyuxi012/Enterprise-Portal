from __future__ import annotations

from fastapi import APIRouter, Depends

from iam.deps import verify_admin_aud
from modules.admin.routers import (
    admin_tasks,
    ai_admin,
    dashboard,
    departments,
    employees,
    logs,
    system,
)
from modules.portal.routers import announcements, carousel, kb, news, notifications, tools, upload


def register_admin_routes(router: APIRouter) -> None:
    router.include_router(dashboard.router)
    router.include_router(system.router)
    router.include_router(employees.router)
    router.include_router(departments.router)
    router.include_router(logs.router)
    router.include_router(ai_admin.router)
    router.include_router(admin_tasks.router)
    router.include_router(kb.router)
    router.include_router(notifications.router)
    router.include_router(notifications.admin_router)
    router.include_router(news.router)
    router.include_router(announcements.router)
    router.include_router(tools.router)
    router.include_router(carousel.router)
    router.include_router(upload.router)


def build_admin_router() -> APIRouter:
    router = APIRouter(prefix="/admin", dependencies=[Depends(verify_admin_aud)])
    register_admin_routes(router)
    return router
