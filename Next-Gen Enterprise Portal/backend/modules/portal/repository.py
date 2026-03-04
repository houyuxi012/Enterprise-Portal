from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models


class PortalRepository:
    @staticmethod
    async def get_active_news(db: AsyncSession) -> list[models.NewsItem]:
        result = await db.execute(select(models.NewsItem).order_by(models.NewsItem.id.desc()))
        return list(result.scalars().all())

