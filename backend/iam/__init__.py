"""
IAM 模块 - 身份认证与访问控制
拆分为 identity/rbac/audit 三个子模块
"""
from fastapi import APIRouter
from .identity.router import router as identity_router
from .rbac.router import router as rbac_router
from .audit.router import router as audit_router

router = APIRouter(prefix="/iam", tags=["iam"])

# 挂载子路由
router.include_router(identity_router)
router.include_router(rbac_router)
router.include_router(audit_router)
