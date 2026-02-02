from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models
from iam.identity.service import IdentityService
from iam.rbac.service import RBACService
from iam.deps import PermissionChecker as NewPermissionChecker

# Legacy support
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    return await IdentityService.get_current_user(request, db)

async def get_current_user_with_roles(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> models.User:
    # Delegate to RBAC Service logic if needed, or keep legacy reload
    # For now, keep as simple re-fetch since RBAC service focuses on permissions
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    stmt = select(models.User).options(
        selectinload(models.User.roles).selectinload(models.Role.permissions)
    ).filter(models.User.id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().first()

async def get_current_user_with_permissions(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> tuple:
    user = await get_current_user(request, db)
    roles, permissions_set, _ = await RBACService.get_user_permissions(user.id, db)
    return user, permissions_set

# Re-export PermissionChecker
PermissionChecker = NewPermissionChecker
