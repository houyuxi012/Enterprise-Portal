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
        # Dual identity isolation: users.account_type (SYSTEM / PORTAL)
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'PORTAL'"
        ))
        await conn.execute(text(
            "UPDATE users SET account_type = 'PORTAL' "
            "WHERE account_type IS NULL OR account_type = ''"
        ))
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS password_violates_policy BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW()"
        ))
        await conn.execute(text(
            "UPDATE users SET password_changed_at = NOW() "
            "WHERE password_changed_at IS NULL"
        ))
        # Keep built-in admin as system account by default
        await conn.execute(text(
            "UPDATE users SET account_type = 'SYSTEM' "
            "WHERE username = 'admin'"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_account_type ON users (account_type)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_password_changed_at ON users (password_changed_at)"
        ))

        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS user_password_history ("
            "id SERIAL PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id), "
            "hashed_password VARCHAR NOT NULL, "
            "changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_user_password_history_user_id_changed_at "
            "ON user_password_history (user_id, changed_at DESC)"
        ))

        await conn.execute(text(
            "ALTER TABLE announcements "
            "ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
        ))
        await conn.execute(text(
            "UPDATE announcements SET created_at = NOW() "
            "WHERE created_at IS NULL"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_announcements_created_at "
            "ON announcements (created_at DESC)"
        ))

        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS announcement_reads ("
            "id SERIAL PRIMARY KEY, "
            "user_id INTEGER NOT NULL REFERENCES users(id), "
            "announcement_id INTEGER NOT NULL REFERENCES announcements(id), "
            "read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
            "CONSTRAINT uq_announcement_read_user_announcement UNIQUE (user_id, announcement_id)"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_announcement_reads_user_announcement "
            "ON announcement_reads (user_id, announcement_id)"
        ))

        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS notifications ("
            "id SERIAL PRIMARY KEY, "
            "title VARCHAR NOT NULL, "
            "message TEXT NOT NULL, "
            "type VARCHAR(20) NOT NULL DEFAULT 'info', "
            "action_url VARCHAR, "
            "created_by INTEGER REFERENCES users(id), "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_notifications_created_at "
            "ON notifications (created_at DESC)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_notifications_created_by "
            "ON notifications (created_by)"
        ))

        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS notification_receipts ("
            "id SERIAL PRIMARY KEY, "
            "notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE, "
            "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "is_read BOOLEAN NOT NULL DEFAULT FALSE, "
            "read_at TIMESTAMPTZ, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
            "CONSTRAINT uq_notification_receipt_notification_user UNIQUE (notification_id, user_id)"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_notification_receipts_user_read_created_at "
            "ON notification_receipts (user_id, is_read, created_at DESC)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_notification_receipts_notification_id "
            "ON notification_receipts (notification_id)"
        ))

        # AI provider model kind (text / multimodal)
        await conn.execute(text(
            "ALTER TABLE ai_providers "
            "ADD COLUMN IF NOT EXISTS model_kind VARCHAR DEFAULT 'text'"
        ))
        await conn.execute(text(
            "UPDATE ai_providers SET model_kind = 'text' "
            "WHERE model_kind IS NULL OR model_kind = ''"
        ))

        # Role description for IAM role management UI
        await conn.execute(text(
            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS description VARCHAR"
        ))

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
