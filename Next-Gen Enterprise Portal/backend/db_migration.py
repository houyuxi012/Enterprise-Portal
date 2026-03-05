from __future__ import annotations

import asyncio

from core.migrations import run_db_migrations


async def migrate_db() -> None:
    await run_db_migrations()


if __name__ == "__main__":
    asyncio.run(migrate_db())
