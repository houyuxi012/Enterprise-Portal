from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)


def _build_alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parent.parent
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "db_migrations"))

    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        config.set_main_option("sqlalchemy.url", database_url)

    return config


def _upgrade_head_sync() -> None:
    cfg = _build_alembic_config()
    command.upgrade(cfg, "head")


async def run_db_migrations() -> None:
    """Run Alembic migrations to head in a worker thread."""
    logger.info("Running Alembic migrations to head...")
    await asyncio.to_thread(_upgrade_head_sync)
