"""
Identity Schemas - 认证相关数据结构
"""
from pydantic import BaseModel
from typing import Optional, List
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
    email: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    is_active: bool = True
    roles: List[RoleOut] = []
    permissions: List[str] = []
    perm_version: int = 1
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """登录成功响应"""
    message: str = "Login successful"
    token_type: str = "bearer"
    access_token: Optional[str] = None


class LogoutResponse(BaseModel):
    """登出成功响应"""
    message: str = "Logout successful"
