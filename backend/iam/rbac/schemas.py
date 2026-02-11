"""
RBAC Schemas - 角色/权限数据结构
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PermissionBase(BaseModel):
    code: str
    description: str
    app_id: Optional[str] = "portal"


class PermissionCreate(PermissionBase):
    pass


class Permission(PermissionBase):
    id: int
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class RoleBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    app_id: Optional[str] = "portal"


class RoleCreate(RoleBase):
    permission_ids: List[int] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None


class Role(RoleBase):
    id: int
    permissions: List[Permission] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    """简化角色输出"""
    id: int
    code: str
    name: str
    app_id: str = "portal"
    
    class Config:
        from_attributes = True


class UserOut(BaseModel):
    """用户输出模型（用于 IAM 用户列表）"""
    id: int
    username: str
    email: Optional[str] = None
    account_type: str = "PORTAL"
    is_active: bool = True
    name: Optional[str] = None
    avatar: Optional[str] = None
    roles: List[RoleOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    is_active: bool = True
    role: Optional[str] = None
    role_ids: List[int] = Field(default_factory=list)
    name: Optional[str] = None
    avatar: Optional[str] = None

    class Config:
        extra = "forbid"


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None
    name: Optional[str] = None
    avatar: Optional[str] = None

    class Config:
        extra = "forbid"


class UserOption(BaseModel):
    """精简用户选项（用于下拉框）"""
    id: int
    username: str
    name: Optional[str] = None
    avatar: Optional[str] = None

    class Config:
        from_attributes = True


class PasswordResetRequest(BaseModel):
    username: str
    new_password: Optional[str] = None
