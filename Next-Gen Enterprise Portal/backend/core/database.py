from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from core.runtime_secrets import get_required_env
from core.db_tls import (
    build_asyncpg_url_and_connect_args,
    database_url_requests_tls,
    validate_database_tls_policy,
)

load_dotenv()
logger = logging.getLogger(__name__)

DATABASE_URL = get_required_env("DATABASE_URL")
DB_TLS_STRICT = os.getenv("DB_TLS_STRICT", "true").lower() != "false"
if not database_url_requests_tls(DATABASE_URL):
    logger.warning("DATABASE_URL has no TLS parameter (sslmode/ssl). Prefer TLS-enabled DB connections.")
validate_database_tls_policy(DATABASE_URL, strict_mode=DB_TLS_STRICT)
if "://user:password@" in DATABASE_URL:
    logger.warning("DATABASE_URL appears to use default weak credentials; please rotate immediately.")

NORMALIZED_DATABASE_URL, DATABASE_CONNECT_ARGS = build_asyncpg_url_and_connect_args(DATABASE_URL)

DEBUG = os.getenv("DEBUG", "False").lower() == "true"
# Keep conservative defaults to avoid exhausting PostgreSQL max_connections.
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "15"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "15"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))
WEB_CONCURRENCY = int(os.getenv("WEB_CONCURRENCY", "1"))
DB_MAX_CONNECTION_BUDGET = int(os.getenv("DB_MAX_CONNECTION_BUDGET", "120"))

_potential_connections = WEB_CONCURRENCY * (DB_POOL_SIZE + DB_MAX_OVERFLOW)
if _potential_connections > DB_MAX_CONNECTION_BUDGET:
    logger.warning(
        "Potential DB connections (%s) exceed configured budget (%s). "
        "Adjust DB_POOL_SIZE/DB_MAX_OVERFLOW/WEB_CONCURRENCY.",
        _potential_connections,
        DB_MAX_CONNECTION_BUDGET,
    )

engine = create_async_engine(
    NORMALIZED_DATABASE_URL,
    echo=DEBUG,
    future=True,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
    pool_recycle=DB_POOL_RECYCLE,
    pool_pre_ping=True,
    connect_args=DATABASE_CONNECT_ARGS,
)

SessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with SessionLocal() as session:
        yield session


async def init_pgvector() -> None:
    """Enable pgvector extension before schema migration/usage."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
