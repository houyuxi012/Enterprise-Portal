"""
Identity Router - 认证路由
/iam/auth/token, /iam/auth/logout, /iam/auth/me
"""
from fastapi import APIRouter, Depends, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from .service import IdentityService
from .schemas import UserMeResponse, TokenResponse, LogoutResponse, RoleOut
from iam.deps import get_db, get_current_identity
from iam.rbac.service import RBACService

router = APIRouter(prefix="/auth", tags=["iam-identity"])


@router.post("/token", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """用户登录"""
    return await IdentityService.login(request, response, form_data, db)


@router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response):
    """用户登出"""
    return await IdentityService.logout(response)


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """获取当前用户信息"""
    user = await IdentityService.get_current_user(request, db)
    roles, permissions_set, perm_version = await RBACService.get_user_permissions(user.id, db)
    
    return UserMeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        is_active=user.is_active,
        roles=[RoleOut(**r) for r in roles],
        permissions=list(permissions_set),
        perm_version=perm_version
    )
