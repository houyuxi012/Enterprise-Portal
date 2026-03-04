from __future__ import annotations

from fastapi import APIRouter, Depends

import iam as iam_package
from iam.deps import verify_admin_aud
from modules.admin.routers import system
from modules.iam.routers import captcha, mfa as mfa_router_module, portal_auth, public, session
from modules.iam.routers.iam_directories import router as iam_directory_router

router = APIRouter()

router.include_router(iam_package.router)
router.include_router(iam_directory_router, prefix="/iam")
router.include_router(portal_auth.router)
router.include_router(mfa_router_module.router)
router.include_router(public.router)
router.include_router(captcha.router)
router.include_router(session.router)
router.include_router(system.license_alias_router, dependencies=[Depends(verify_admin_aud)])
