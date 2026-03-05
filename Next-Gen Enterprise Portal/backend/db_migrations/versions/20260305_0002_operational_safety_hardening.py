"""Operational safety hardening for DB startup, constraints, and lifecycle.

Revision ID: 20260305_0002
Revises: 20260305_0001
Create Date: 2026-03-05 15:20:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260305_0002"
down_revision = "20260305_0001"
branch_labels = None
depends_on = None


def _add_check_constraint_not_valid(table: str, name: str, expression: str) -> None:
    op.execute(
        sa.text(
            f"""
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '{name}'
    ) THEN
        ALTER TABLE {table}
        ADD CONSTRAINT {name}
        CHECK ({expression}) NOT VALID;
    END IF;
END
$$;
"""
        )
    )


def _create_updated_at_trigger(table: str) -> None:
    trigger_name = f"trg_{table}_set_updated_at"
    op.execute(
        sa.text(
            f"""
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = '{trigger_name}'
    ) THEN
        CREATE TRIGGER {trigger_name}
        BEFORE UPDATE ON {table}
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at_timestamp();
    END IF;
END
$$;
"""
        )
    )


def upgrade() -> None:
    # 0) Move startup status schema creation out of runtime startup path.
    op.execute(
        sa.text(
            """
CREATE TABLE IF NOT EXISTS system_startup_status (
    boot_id TEXT PRIMARY KEY,
    instance_id TEXT,
    status TEXT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    error TEXT
)
"""
        )
    )
    op.execute(
        sa.text("CREATE INDEX IF NOT EXISTS ix_system_startup_status_status ON system_startup_status (status)")
    )

    # 1) Tighten critical field constraints (safe rollout via NOT VALID checks).
    op.execute(sa.text("ALTER TABLE user_password_history ALTER COLUMN hashed_password TYPE VARCHAR(255)"))
    _add_check_constraint_not_valid(
        "user_password_history",
        "ck_user_password_history_hash_nonempty",
        "char_length(trim(hashed_password)) >= 40",
    )

    _add_check_constraint_not_valid(
        "directory_configs",
        "ck_directory_configs_host_nonempty",
        "char_length(trim(host)) > 0",
    )
    _add_check_constraint_not_valid(
        "directory_configs",
        "ck_directory_configs_base_dn_nonempty",
        "char_length(trim(base_dn)) > 0",
    )
    _add_check_constraint_not_valid(
        "directory_configs",
        "ck_directory_configs_port_range",
        "port BETWEEN 1 AND 65535",
    )
    _add_check_constraint_not_valid(
        "directory_configs",
        "ck_directory_configs_sync_page_size_range",
        "sync_page_size BETWEEN 1 AND 10000",
    )
    _add_check_constraint_not_valid(
        "directory_configs",
        "ck_directory_configs_delete_grace_days_range",
        "delete_grace_days BETWEEN 0 AND 3650",
    )

    # 2) Add DB-managed updated_at maintenance to avoid app-layer drift.
    op.execute(
        sa.text(
            """
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""
        )
    )
    _create_updated_at_trigger("directory_configs")
    _create_updated_at_trigger("license_state")
    _create_updated_at_trigger("todos")

    # 3) Retention-friendly indexes and defaults for growth control.
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sync_jobs_started_at ON sync_jobs (started_at)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_business_logs_timestamp ON business_logs (timestamp)"))

    retention_defaults = {
        "retention_license_events_days": "365",
        "retention_notification_receipts_days": "180",
        "retention_sync_jobs_days": "90",
    }
    for key, value in retention_defaults.items():
        op.execute(
            sa.text(
                """
INSERT INTO system_config (key, value)
VALUES (:key, :value)
ON CONFLICT (key) DO NOTHING
"""
            ).bindparams(key=key, value=value)
        )

    # 4) Replace static IVF-Flat with adaptive HNSW strategy.
    op.execute(sa.text("DROP INDEX IF EXISTS ix_kb_chunks_embedding_ivfflat"))
    op.execute(
        sa.text(
            """
DO $$
DECLARE
    chunk_count BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
        SELECT COUNT(*) INTO chunk_count FROM kb_chunks;
        IF chunk_count > 0 THEN
            IF to_regclass('public.ix_kb_chunks_embedding_hnsw') IS NULL THEN
                EXECUTE 'CREATE INDEX ix_kb_chunks_embedding_hnsw ON kb_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)';
            END IF;
        END IF;
    END IF;
END
$$;
"""
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_system_startup_status_status"))
    op.execute(sa.text("DROP TABLE IF EXISTS system_startup_status"))

    op.execute(sa.text("DROP INDEX IF EXISTS ix_kb_chunks_embedding_hnsw"))

    for key in (
        "retention_license_events_days",
        "retention_notification_receipts_days",
        "retention_sync_jobs_days",
    ):
        op.execute(sa.text("DELETE FROM system_config WHERE key = :key").bindparams(key=key))

    op.execute(sa.text("DROP INDEX IF EXISTS ix_business_logs_timestamp"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_sync_jobs_started_at"))

    for trigger_name, table_name in (
        ("trg_directory_configs_set_updated_at", "directory_configs"),
        ("trg_license_state_set_updated_at", "license_state"),
        ("trg_todos_set_updated_at", "todos"),
    ):
        op.execute(sa.text(f"DROP TRIGGER IF EXISTS {trigger_name} ON {table_name}"))

    op.execute(sa.text("DROP FUNCTION IF EXISTS set_updated_at_timestamp"))

    for table, constraint in (
        ("directory_configs", "ck_directory_configs_delete_grace_days_range"),
        ("directory_configs", "ck_directory_configs_sync_page_size_range"),
        ("directory_configs", "ck_directory_configs_port_range"),
        ("directory_configs", "ck_directory_configs_base_dn_nonempty"),
        ("directory_configs", "ck_directory_configs_host_nonempty"),
        ("user_password_history", "ck_user_password_history_hash_nonempty"),
    ):
        op.execute(sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}"))
