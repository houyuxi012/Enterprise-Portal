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
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "50"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "100"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))

# 3. Production Engine Config
engine = create_async_engine(
    DATABASE_URL,
    echo=DEBUG,
    future=True,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
    pool_recycle=DB_POOL_RECYCLE,
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
            "ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW()"
        ))
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS directory_id INTEGER"
        ))
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)"
        ))
        await conn.execute(text(
            "UPDATE users SET password_changed_at = NOW() "
            "WHERE password_changed_at IS NULL"
        ))
        await conn.execute(text(
            "UPDATE users SET password_change_required = FALSE "
            "WHERE password_change_required IS NULL"
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
            "CREATE INDEX IF NOT EXISTS ix_users_directory_id ON users (directory_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_external_id ON users (external_id)"
        ))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_directory_external_id "
            "ON users (directory_id, external_id) "
            "WHERE external_id IS NOT NULL"
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

        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS directory_configs ("
            "id SERIAL PRIMARY KEY, "
            "name VARCHAR(128) NOT NULL UNIQUE, "
            "type VARCHAR(20) NOT NULL, "
            "host VARCHAR(255) NOT NULL, "
            "port INTEGER NOT NULL DEFAULT 389, "
            "use_ssl BOOLEAN NOT NULL DEFAULT FALSE, "
            "start_tls BOOLEAN NOT NULL DEFAULT FALSE, "
            "bind_dn VARCHAR(512), "
            "remark VARCHAR(500), "
            "bind_password_ciphertext TEXT, "
            "base_dn VARCHAR(512) NOT NULL, "
            "user_filter VARCHAR(512) NOT NULL DEFAULT '(&(objectClass=inetOrgPerson)(uid={username}))', "
            "username_attr VARCHAR(128) NOT NULL DEFAULT 'uid', "
            "email_attr VARCHAR(128) NOT NULL DEFAULT 'mail', "
            "display_name_attr VARCHAR(128) NOT NULL DEFAULT 'cn', "
            "mobile_attr VARCHAR(128) NOT NULL DEFAULT 'mobile', "
            "avatar_attr VARCHAR(128) NOT NULL DEFAULT 'jpegPhoto', "
            "sync_mode VARCHAR(20) NOT NULL DEFAULT 'manual', "
            "sync_interval_minutes INTEGER, "
            "enabled BOOLEAN NOT NULL DEFAULT FALSE, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
            "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            ")"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS remark VARCHAR(500)"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS sync_mode VARCHAR(20) NOT NULL DEFAULT 'manual'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS mobile_attr VARCHAR(128) NOT NULL DEFAULT 'mobile'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS avatar_attr VARCHAR(128) NOT NULL DEFAULT 'jpegPhoto'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS sync_page_size INTEGER NOT NULL DEFAULT 1000"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS sync_cursor VARCHAR(255)"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS org_base_dn VARCHAR(512)"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS org_filter VARCHAR(512) DEFAULT '(objectClass=organizationalUnit)'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS org_name_attr VARCHAR(128) DEFAULT 'ou'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS group_base_dn VARCHAR(512)"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS group_filter VARCHAR(512) DEFAULT '(objectClass=groupOfNames)'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS group_name_attr VARCHAR(128) DEFAULT 'cn'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS group_desc_attr VARCHAR(128) DEFAULT 'description'"
        ))
        # Update column defaults for existing tables (migration from AD defaults to universal defaults)
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ALTER COLUMN user_filter SET DEFAULT '(&(objectClass=inetOrgPerson)(uid={username}))'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ALTER COLUMN username_attr SET DEFAULT 'uid'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ALTER COLUMN display_name_attr SET DEFAULT 'cn'"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ALTER COLUMN avatar_attr SET DEFAULT 'jpegPhoto'"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_directory_configs_enabled ON directory_configs (enabled)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_directory_configs_type ON directory_configs (type)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_directory_configs_sync_mode ON directory_configs (sync_mode)"
        ))

        # Add external identity linking to departments
        await conn.execute(text(
            "ALTER TABLE departments "
            "ADD COLUMN IF NOT EXISTS directory_id INTEGER"
        ))
        await conn.execute(text(
            "ALTER TABLE departments "
            "ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_departments_directory_id ON departments (directory_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_departments_external_id ON departments (external_id)"
        ))
        
        # Add external identity linking to roles
        await conn.execute(text(
            "ALTER TABLE roles "
            "ADD COLUMN IF NOT EXISTS directory_id INTEGER"
        ))
        await conn.execute(text(
            "ALTER TABLE roles "
            "ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_roles_directory_id ON roles (directory_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_roles_external_id ON roles (external_id)"
        ))

        # Enterprise License state (feature gate)
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS license_state ("
            "id INTEGER PRIMARY KEY, "
            "product_id VARCHAR(128) NOT NULL, "
            "installation_id VARCHAR(128) NOT NULL, "
            "grant_type VARCHAR(20) NOT NULL, "
            "customer VARCHAR(255), "
            "features JSONB NOT NULL DEFAULT '{}'::jsonb, "
            "limits JSONB NOT NULL DEFAULT '{}'::jsonb, "
            "payload JSONB, "
            "not_before TIMESTAMPTZ NOT NULL, "
            "expires_at TIMESTAMPTZ NOT NULL, "
            "signature TEXT NOT NULL, "
            "fingerprint VARCHAR(128) NOT NULL, "
            "status VARCHAR(20) NOT NULL DEFAULT 'active', "
            "reason VARCHAR(255), "
            "last_seen_time TIMESTAMPTZ, "
            "installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
            "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_license_state_status ON license_state (status)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_license_state_expires_at ON license_state (expires_at)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_license_state_installation_id ON license_state (installation_id)"
        ))

        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS license_events ("
            "id SERIAL PRIMARY KEY, "
            "event_type VARCHAR(64) NOT NULL, "
            "status VARCHAR(20) NOT NULL, "
            "reason VARCHAR(128), "
            "payload JSONB, "
            "signature TEXT, "
            "fingerprint VARCHAR(128), "
            "product_id VARCHAR(128), "
            "installation_id VARCHAR(128), "
            "grant_type VARCHAR(20), "
            "customer VARCHAR(255), "
            "actor_id INTEGER REFERENCES users(id), "
            "actor_username VARCHAR(255), "
            "ip_address VARCHAR(64), "
            "trace_id VARCHAR(128), "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_license_events_type_created_at "
            "ON license_events (event_type, created_at DESC)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_license_events_status_created_at "
            "ON license_events (status, created_at DESC)"
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

        # Default security config values (only if absent)
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('max_concurrent_sessions', '0') "
            "ON CONFLICT (key) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('login_session_timeout_minutes', '5') "
            "ON CONFLICT (key) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('login_session_absolute_timeout_minutes', '480') "
            "ON CONFLICT (key) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('login_session_refresh_window_minutes', '10') "
            "ON CONFLICT (key) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('login_captcha_threshold', '3') "
            "ON CONFLICT (key) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('security_lockout_scope', 'account') "
            "ON CONFLICT (key) DO NOTHING"
        ))
        await conn.execute(text(
            "INSERT INTO system_config (key, value) VALUES ('security_force_change_password_after_reset', 'false') "
            "ON CONFLICT (key) DO NOTHING"
        ))

        # ── LDAP sync hardening migrations ────────────────────────────────
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS sync_jobs ("
            "id SERIAL PRIMARY KEY, "
            "directory_id INTEGER NOT NULL REFERENCES directory_configs(id), "
            "job_type VARCHAR(20) NOT NULL DEFAULT 'full', "
            "status VARCHAR(20) NOT NULL DEFAULT 'running', "
            "stage VARCHAR(20), "
            "checkpoint_data JSONB, "
            "stats JSONB, "
            "cursor_start VARCHAR(255), "
            "cursor_end VARCHAR(255), "
            "max_usn_seen VARCHAR(255), "
            "error_detail TEXT, "
            "started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
            "finished_at TIMESTAMPTZ"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_sync_jobs_directory_id ON sync_jobs (directory_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_sync_jobs_status ON sync_jobs (status)"
        ))

        # DirectoryConfig: delete protection
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS delete_grace_days INTEGER NOT NULL DEFAULT 7"
        ))
        await conn.execute(text(
            "ALTER TABLE directory_configs "
            "ADD COLUMN IF NOT EXISTS delete_whitelist TEXT"
        ))

        # Employee: primary department + avatar hash
        await conn.execute(text(
            "ALTER TABLE employees "
            "ADD COLUMN IF NOT EXISTS primary_department_id INTEGER REFERENCES departments(id)"
        ))
        await conn.execute(text(
            "ALTER TABLE employees "
            "ADD COLUMN IF NOT EXISTS avatar_hash VARCHAR(64)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_employees_primary_department_id "
            "ON employees (primary_department_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_employees_avatar_hash "
            "ON employees (avatar_hash)"
        ))

        # User: pending delete marker
        await conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS pending_delete_at TIMESTAMPTZ"
        ))
