"""
Identity Router - 认证路由
/iam/auth/portal/token, /iam/auth/admin/token, /iam/auth/logout, /iam/auth/me
"""
from fastapi import APIRouter, Depends, Request, Response, Query, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from .service import IdentityService
from .schemas import UserMeResponse, TokenResponse, LogoutResponse, RoleOut, PasswordChangeRequest
from iam.deps import get_db, get_current_identity
from iam.rbac.service import RBACService
from iam.audit.service import IAMAuditService
from services.password_policy import set_user_password
import utils

router = APIRouter(prefix="/auth", tags=["iam-identity"])
user_router = APIRouter(prefix="/users", tags=["iam-identity"])

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
        password_violates_policy=getattr(user, "password_violates_policy", False),
        roles=[RoleOut(**r) for r in roles],
        permissions=list(permissions_set),
        perm_version=perm_version
    )


@user_router.put("/me/password", status_code=status.HTTP_200_OK)
async def change_my_password(
    request: Request,
    payload: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_identity),
):
    if not utils.verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="原密码不正确")
    if payload.old_password == payload.new_password:
        raise HTTPException(status_code=400, detail="新密码不能与原密码相同")

    await set_user_password(db, current_user, payload.new_password, validate=True)

    trace_id = request.headers.get("X-Request-ID")
    ip = request.client.host if request.client else "unknown"
    await IAMAuditService.log(
        db,
        action="iam.user.password_change",
        target_type="user",
        user_id=current_user.id,
        username=current_user.username,
        target_id=current_user.id,
        target_name=current_user.username,
        ip_address=ip,
        trace_id=trace_id,
    )
    await db.commit()
    return {"message": "密码修改成功"}
