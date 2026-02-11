"""
Identity Router - 认证路由
/iam/auth/portal/token, /iam/auth/admin/token, /iam/auth/logout, /iam/auth/me
"""
from fastapi import APIRouter, Depends, Request, Response, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from .service import IdentityService
from .schemas import UserMeResponse, TokenResponse, LogoutResponse, RoleOut
from iam.deps import get_db, get_current_identity
from iam.rbac.service import RBACService

router = APIRouter(prefix="/auth", tags=["iam-identity"])

@router.post("/portal/token", response_model=TokenResponse)
async def login_portal(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Portal User Login (Audience: portal)"""
    return await IdentityService.login_portal(request, response, form_data, db)

@router.post("/admin/token", response_model=TokenResponse)
async def login_admin(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Admin User Login (Audience: admin) - Requires Admin Privileges"""
    return await IdentityService.login_admin(request, response, form_data, db)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """用户登出"""
    return await IdentityService.logout(response, request=request, db=db)


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    request: Request,
    db: AsyncSession = Depends(get_db),
    audience: str | None = Query(default=None, pattern="^(admin|portal)$"),
):
    """获取当前用户信息"""
    user = await IdentityService.get_current_user(request, db, audience=audience)
    roles, permissions_set, perm_version = await RBACService.get_user_permissions(user.id, db)
    
    return UserMeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        account_type=getattr(user, "account_type", "PORTAL"),
        name=user.name,
        avatar=user.avatar,
        is_active=user.is_active,
        roles=[RoleOut(**r) for r in roles],
        permissions=list(permissions_set),
        perm_version=perm_version
    )
