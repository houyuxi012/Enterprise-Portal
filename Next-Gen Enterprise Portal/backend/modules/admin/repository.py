from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models


class AdminRepository:
    @staticmethod
    async def get_business_logs(db: AsyncSession, limit: int = 50) -> list[models.BusinessLog]:
        stmt = select(models.BusinessLog).order_by(models.BusinessLog.id.desc()).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())

