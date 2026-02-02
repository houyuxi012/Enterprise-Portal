"""
RBAC Models - 权限/角色模型
注意：为避免循环导入，实际模型仍在 models.py 中定义
此文件提供模型引用的统一入口
"""
# 从主 models 模块导入，保持单一数据源
from models import (
    Permission,
    Role,
    user_roles,
    role_permissions
)

__all__ = [
    'Permission',
    'Role',
    'user_roles',
    'role_permissions'
]
