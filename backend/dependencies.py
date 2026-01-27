from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import get_db
import models
from routers.auth import get_current_user

# Dependency to get user with full permission tree loaded
async def get_current_user_with_roles(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> models.User:
    # Refresh to load relationships
    # Async loading of M:N relationships
    stmt = select(models.User).options(
        selectinload(models.User.roles).selectinload(models.Role.permissions)
    ).filter(models.User.id == current_user.id)
    
    result = await db.execute(stmt)
    user = result.scalars().first()
    return user

class PermissionChecker:
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    async def __call__(self, user: models.User = Depends(get_current_user_with_roles)):
        # Admin bypass (Optionally, but strictly speaking we should check "role code" or specific permission)
        # But user said "No if user.role == 'admin'". 
        # So we MUST check permissions. 
        # But typically Admin role HAS all permissions, so checking permission is enough.
        
        has_permission = False
        for role in user.roles:
            for perm in role.permissions:
                if perm.code == self.required_permission:
                    has_permission = True
                    break
            if has_permission:
                break
        
        if not has_permission:
            # Fallback for legacy "admin" role string if DB migration didn't fully work or for safety
            # Check if user has legacy 'admin' role string AND the permission is a system one?
            # No, user disallowed "if username == admin". They didn't explicitly forbid "if role == admin" but implied RBAC.
            # I will strictly stick to permission existence.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required: {self.required_permission}"
            )
        return True
