from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from core.runtime_secrets import get_env

logger = logging.getLogger(__name__)


def _build_alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parent.parent
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "db_migrations"))

    database_url = get_env("DATABASE_URL").strip()
    if database_url:
        config.set_main_option("sqlalchemy.url", database_url)

    return config


def _upgrade_head_sync() -> None:
    cfg = _build_alembic_config()
    command.upgrade(cfg, "head")


def should_run_migrations_on_startup() -> bool:
    raw = os.getenv("DB_AUTO_MIGRATE_ON_STARTUP", "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _get_alembic_head() -> str:
    cfg = _build_alembic_config()
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    if len(heads) != 1:
        raise RuntimeError(f"Expected exactly one Alembic head, found: {heads}")
    return heads[0]


async def ensure_db_schema_is_current() -> None:
    """Fail fast when startup auto-migration is disabled but DB isn't at head."""
    from core.database import engine

    expected_head = _get_alembic_head()
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            row = result.first()
            current = str(row[0]).strip() if row and row[0] else ""
    except Exception as exc:
        raise RuntimeError(
            "Database schema is not initialized (missing alembic_version). "
            "Run `python backend/db_migration.py` before starting application workers."
        ) from exc

    if current != expected_head:
        raise RuntimeError(
            "Database schema is not at Alembic head. "
            f"current={current or '<none>'}, expected={expected_head}. "
            "Run `python backend/db_migration.py` before starting application workers."
        )


async def run_db_migrations() -> None:
    """Run Alembic migrations to head in a worker thread."""
    logger.info("Running Alembic migrations to head...")
    await asyncio.to_thread(_upgrade_head_sync)
