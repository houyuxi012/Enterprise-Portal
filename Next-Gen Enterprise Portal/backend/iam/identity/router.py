"""
Identity Router - 认证路由
/iam/auth/portal/token, /iam/auth/admin/token, /iam/auth/logout, /iam/auth/me
"""
from fastapi import APIRouter, Depends, Request, Response, Query, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core import security

from .service import IdentityService
from .schemas import (
    UserMeResponse,
    TokenResponse,
    LogoutResponse,
    RoleOut,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetConfirmResponse,
    PasswordResetRequestPayload,
    PasswordResetRequestResponse,
    PasswordResetValidateResponse,
    SessionScopeRequest,
    SessionRevokeResponse,
    OnlineUserSessionItem,
)
from iam.deps import get_db, PermissionChecker, verify_admin_aud
from iam.rbac.service import RBACService
from iam.audit.service import IAMAuditService
from modules.admin.services.license_service import LicenseService
from modules.iam.services.password_reset_service import (
    confirm_password_reset,
    request_password_reset,
    validate_password_reset_token,
)
from modules.iam.services.password_policy import set_user_password
import modules.models as models

router = APIRouter(prefix="/auth", tags=["iam-identity"])
user_router = APIRouter(prefix="/users", tags=["iam-identity"])


async def _require_session_security_feature(
    db: AsyncSession = Depends(get_db),
) -> None:
    await LicenseService.require_feature(db, "session.security")


async def _stash_privacy_consent_form(request: Request) -> None:
    form = await request.form()
    request.state.privacy_consent_accepted = str(form.get("privacy_consent_accepted") or "").strip()
    request.state.privacy_policy_version = str(form.get("privacy_policy_version") or "").strip()
    request.state.privacy_policy_hash = str(form.get("privacy_policy_hash") or "").strip()
    request.state.privacy_consent_locale = str(form.get("privacy_consent_locale") or "").strip()

@router.post("/portal/token", response_model=TokenResponse)
async def login_portal(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Portal User Login (Audience: portal)"""
    await _stash_privacy_consent_form(request)
    return await IdentityService.login_portal(request, response, form_data, db)

@router.post("/admin/token", response_model=TokenResponse)
async def login_admin(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Admin User Login (Audience: admin) - Requires Admin Privileges"""
    await _stash_privacy_consent_form(request)
    return await IdentityService.login_admin(request, response, form_data, db)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """用户登出"""
    return await IdentityService.logout(response, request=request, db=db)


@router.post("/logout-all", response_model=SessionRevokeResponse)
async def logout_all(
    request: Request,
    response: Response,
    payload: SessionScopeRequest | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_session_security_feature),
):
    """当前用户全端下线（可按 audience_scope）。"""
    return await IdentityService.logout_all(
        response=response,
        request=request,
        db=db,
        audience_scope=(payload.audience_scope if payload else "all"),
    )


@router.post(
    "/sessions/{user_id}/kick",
    response_model=SessionRevokeResponse,
    dependencies=[Depends(verify_admin_aud)],
)
async def kick_user_sessions(
    user_id: int,
    request: Request,
    payload: SessionScopeRequest | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_session_security_feature),
    current_user=Depends(PermissionChecker("sys:user:edit")),
):
    """管理员踢指定用户下线（可按 audience_scope）。"""
    return await IdentityService.kick_user_sessions(
        operator=current_user,
        target_user_id=user_id,
        audience_scope=(payload.audience_scope if payload else "all"),
        request=request,
        db=db,
    )


@router.get(
    "/sessions/online",
    response_model=list[OnlineUserSessionItem],
    dependencies=[Depends(verify_admin_aud)],
)
async def list_online_users(
    audience_scope: str = Query(default="all", pattern="^(admin|portal|all)$"),
    keyword: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _license_gate: None = Depends(_require_session_security_feature),
    _permission: None = Depends(PermissionChecker("sys:user:view")),
):
    """在线用户列表（按 audience_scope 聚合）。"""
    return await IdentityService.list_online_users(
        db=db,
        audience_scope=audience_scope,
        keyword=keyword,
    )


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    request: Request,
    db: AsyncSession = Depends(get_db),
    audience: str | None = Query(default=None, pattern="^(admin|portal)$"),
):
    """获取当前用户信息"""
    user = await IdentityService.get_current_user(request, db, audience=audience)
    resolved_avatar = user.avatar
    if not resolved_avatar:
        employee_result = await db.execute(
            select(models.Employee).filter(models.Employee.account == user.username)
        )
        employee = employee_result.scalars().first()
        if employee and employee.avatar:
            resolved_avatar = employee.avatar
    roles, permissions_set, perm_version = await RBACService.get_user_permissions(user.id, db)
    
    return UserMeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        account_type=getattr(user, "account_type", "PORTAL"),
        name=user.name,
        avatar=resolved_avatar,
        locale=getattr(user, "locale", None),
        auth_source=getattr(user, "auth_source", "local"),
        is_active=user.is_active,
        password_violates_policy=getattr(user, "password_violates_policy", False),
        password_change_required=getattr(user, "password_change_required", False),
        roles=[RoleOut(**r) for r in roles],
        permissions=list(permissions_set),
        perm_version=perm_version
    )


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
async def request_reset_password(
    request: Request,
    payload: PasswordResetRequestPayload,
    audience: str = Query(..., pattern="^(admin|portal)$"),
    db: AsyncSession = Depends(get_db),
):
    return await request_password_reset(
        db,
        request=request,
        identifier=payload.identifier,
        audience=audience,
        locale=payload.locale,
    )


@router.get("/password-reset/validate", response_model=PasswordResetValidateResponse)
async def validate_reset_password_token(
    token: str = Query(..., min_length=16),
    audience: str = Query(..., pattern="^(admin|portal)$"),
    db: AsyncSession = Depends(get_db),
):
    data = await validate_password_reset_token(db, token=token, audience=audience)
    return PasswordResetValidateResponse(**data)


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
async def confirm_reset_password(
    request: Request,
    payload: PasswordResetConfirmRequest,
    audience: str = Query(..., pattern="^(admin|portal)$"),
    db: AsyncSession = Depends(get_db),
):
    return await confirm_password_reset(
        db,
        request=request,
        token=payload.token,
        audience=audience,
        new_password=payload.new_password,
    )


@user_router.put("/me/password", status_code=status.HTTP_200_OK)
async def change_my_password(
    request: Request,
    payload: PasswordChangeRequest,
    audience: str | None = Query(default=None, pattern="^(admin|portal)$"),
    db: AsyncSession = Depends(get_db),
):
    current_user = await IdentityService.get_current_user(request, db, audience=audience)
    if getattr(current_user, "auth_source", "local") != "local":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "PASSWORD_MANAGED_EXTERNALLY",
                "message": "该账户由外部目录服务管理，请在目录服务中修改密码",
            },
        )
    if not await security.verify_password(payload.old_password, current_user.hashed_password):
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
