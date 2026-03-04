"""
RBAC Models - 权限/角色模型
注意：为避免循环导入，实际模型统一定义在 modules.models
此文件提供模型引用的统一入口
"""
# 从 modules.models 导入，保持单一数据源
from modules.models import (
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
