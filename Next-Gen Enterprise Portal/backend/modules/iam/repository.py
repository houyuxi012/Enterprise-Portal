from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models


class IAMRepository:
    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: int) -> models.User | None:
        result = await db.execute(select(models.User).filter(models.User.id == user_id))
        return result.scalars().first()

