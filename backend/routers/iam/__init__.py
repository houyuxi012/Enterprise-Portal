"""
IAM 模块入口
聚合 auth/admin 子路由
"""
from fastapi import APIRouter
from .auth import router as auth_router
from .admin import router as admin_router
from .audit.router import router as audit_router

router = APIRouter(prefix="/iam", tags=["iam"])

# 挂载子路由
router.include_router(auth_router)
router.include_router(admin_router)
router.include_router(audit_router)
