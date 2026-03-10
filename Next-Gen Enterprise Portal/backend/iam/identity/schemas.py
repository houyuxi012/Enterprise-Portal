"""
Identity Schemas - 认证相关数据结构
"""
from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


class RoleOut(BaseModel):
    """简化角色输出"""
    id: int
    code: str
    name: str
    app_id: str = "portal"
    
    class Config:
        from_attributes = True


class UserMeResponse(BaseModel):
    """GET /iam/auth/me 响应"""
    id: int
    username: str
    email: Optional[str] = None
    account_type: str = "PORTAL"
    name: Optional[str] = None
    avatar: Optional[str] = None
    auth_source: Optional[str] = "local"
    is_active: bool = True
    roles: List[RoleOut] = []
    permissions: List[str] = []
    perm_version: int = 1
    password_violates_policy: bool = False
    password_change_required: bool = False
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """登录成功响应"""
    message: str = "Login successful"
    token_type: str = "bearer"
    access_token: Optional[str] = None
    mfa_required: bool = False
    mfa_token: Optional[str] = None
    mfa_methods: List[str] = []
    mfa_setup_required: bool = False


class LogoutResponse(BaseModel):
    """登出成功响应"""
    message: str = "Logout successful"


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


class PasswordResetRequestPayload(BaseModel):
    identifier: str
    locale: Optional[Literal["zh-CN", "en-US"]] = None


class PasswordResetRequestResponse(BaseModel):
    message: str


class PasswordResetValidateResponse(BaseModel):
    message: str
    audience: Literal["admin", "portal"]
    username: str
    email_masked: Optional[str] = None
    expires_at: datetime


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str


class PasswordResetConfirmResponse(BaseModel):
    message: str


class SessionScopeRequest(BaseModel):
    audience_scope: Literal["admin", "portal", "all"] = "all"


class SessionRevokeResponse(BaseModel):
    message: str
    audience_scope: Literal["admin", "portal", "all"] = "all"
    revoked_sessions: int = 0
    target_user_id: Optional[int] = None
    target_username: Optional[str] = None


class OnlineUserSessionItem(BaseModel):
    user_id: int
    username: str
    name: Optional[str] = None
    email: Optional[str] = None
    avatar: Optional[str] = None
    is_active: bool = True
    admin_sessions: int = 0
    portal_sessions: int = 0
    total_sessions: int = 0
    latest_exp_epoch: Optional[int] = None
    latest_exp_at: Optional[datetime] = None


class SessionPingResponse(BaseModel):
    message: str
    audience: Literal["admin", "portal"]
    refreshed: bool = False
    expires_at_epoch: int
    expires_in_seconds: int
    absolute_timeout_minutes: int
