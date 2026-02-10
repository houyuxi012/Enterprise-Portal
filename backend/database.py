from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

# 1. Mandatory DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# 2. Debug setting
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# 3. Production Engine Config
engine = create_async_engine(
    DATABASE_URL,
    echo=DEBUG,
    future=True,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

# 4. Session Configuration
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

async def init_pgvector():
    """Enable pgvector extension on startup."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


async def apply_startup_migrations():
    """
    Apply lightweight startup migrations/indexes for existing deployments.
    """
    async with engine.begin() as conn:
        # KB raw content for lossless reindexing
        await conn.execute(text("ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS content TEXT"))

        # Query performance indexes
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_kb_chunks_doc_id_chunk_index ON kb_chunks (doc_id, chunk_index)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_kb_documents_status_id ON kb_documents (status, id)"
        ))

        # Vector ANN index (ivfflat) for cosine similarity retrieval
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_kb_chunks_embedding_ivfflat "
            "ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
        ))
        await conn.execute(text("ANALYZE kb_chunks"))
