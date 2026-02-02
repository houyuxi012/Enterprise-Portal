"""
RBAC Schemas - 角色/权限数据结构
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


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
    permission_ids: List[int] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None


class Role(RoleBase):
    id: int
    permissions: List[Permission] = []
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
