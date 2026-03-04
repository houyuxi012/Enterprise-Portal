from __future__ import annotations

from fastapi import APIRouter, Depends

from iam.deps import verify_portal_aud
from modules.admin.routers import employees, logs
from modules.portal.routers import ai, announcements, carousel, kb, news, notifications, todos, tools, upload

router = APIRouter(prefix="/app", dependencies=[Depends(verify_portal_aud)])

router.include_router(todos.router)
router.include_router(ai.router)
router.include_router(kb.router)
router.include_router(upload.router)
router.include_router(logs.app_event_router)
router.include_router(employees.app_router)
router.include_router(notifications.router)
router.include_router(news.router)
router.include_router(announcements.router)
router.include_router(tools.router)
router.include_router(carousel.router)
