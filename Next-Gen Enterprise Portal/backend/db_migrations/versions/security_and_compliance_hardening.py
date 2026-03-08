"""Security/compliance hardening for log timestamps and privacy consent evidence.

Revision ID: 20260305_0003
Revises: 20260305_0002
Create Date: 2026-03-05 22:40:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260305_0003"
down_revision = "20260305_0002"
branch_labels = None
depends_on = None


def _get_column_data_type(table_name: str, column_name: str) -> str | None:
    bind = op.get_bind()
    return bind.execute(
        sa.text(
            """
SELECT data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = :table_name
  AND column_name = :column_name
"""
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar_one_or_none()


def _convert_log_timestamp_to_timestamptz(table_name: str) -> None:
    current_type = _get_column_data_type(table_name, "timestamp")
    if current_type == "timestamp with time zone":
        op.execute(sa.text(f"ALTER TABLE {table_name} ALTER COLUMN timestamp SET NOT NULL"))
        op.execute(sa.text(f"ALTER TABLE {table_name} ALTER COLUMN timestamp SET DEFAULT NOW()"))
        op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_timestamp ON {table_name} (timestamp)"))
        return

    if current_type == "timestamp without time zone":
        op.alter_column(
            table_name,
            "timestamp",
            existing_type=sa.DateTime(timezone=False),
            type_=sa.DateTime(timezone=True),
            postgresql_using="timestamp AT TIME ZONE 'UTC'",
        )
        op.execute(sa.text(f"ALTER TABLE {table_name} ALTER COLUMN timestamp SET NOT NULL"))
        op.execute(sa.text(f"ALTER TABLE {table_name} ALTER COLUMN timestamp SET DEFAULT NOW()"))
        op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_timestamp ON {table_name} (timestamp)"))
        return

    op.execute(
        sa.text(
            f"""
ALTER TABLE {table_name}
ADD COLUMN IF NOT EXISTS timestamp_tmp TIMESTAMPTZ
"""
        )
    )
    op.execute(
        sa.text(
            f"""
UPDATE {table_name}
SET timestamp_tmp = COALESCE(_ngep_try_parse_timestamptz(timestamp), NOW())
WHERE timestamp_tmp IS NULL
"""
        )
    )
    op.execute(sa.text(f"ALTER TABLE {table_name} DROP COLUMN IF EXISTS timestamp"))
    op.execute(sa.text(f"ALTER TABLE {table_name} RENAME COLUMN timestamp_tmp TO timestamp"))
    op.execute(sa.text(f"ALTER TABLE {table_name} ALTER COLUMN timestamp SET NOT NULL"))
    op.execute(sa.text(f"ALTER TABLE {table_name} ALTER COLUMN timestamp SET DEFAULT NOW()"))
    op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_timestamp ON {table_name} (timestamp)"))


def _convert_log_timestamp_to_varchar(table_name: str) -> None:
    current_type = _get_column_data_type(table_name, "timestamp")
    if current_type in {"character varying", "text"}:
        op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_timestamp ON {table_name} (timestamp)"))
        return

    op.execute(
        sa.text(
            f"""
ALTER TABLE {table_name}
ADD COLUMN IF NOT EXISTS timestamp_txt VARCHAR
"""
        )
    )
    op.execute(
        sa.text(
            f"""
UPDATE {table_name}
SET timestamp_txt = to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE timestamp_txt IS NULL
"""
        )
    )
    op.execute(sa.text(f"ALTER TABLE {table_name} DROP COLUMN IF EXISTS timestamp"))
    op.execute(sa.text(f"ALTER TABLE {table_name} RENAME COLUMN timestamp_txt TO timestamp"))
    op.execute(sa.text(f"CREATE INDEX IF NOT EXISTS ix_{table_name}_timestamp ON {table_name} (timestamp)"))


def upgrade() -> None:
    op.execute(
        sa.text(
            """
CREATE OR REPLACE FUNCTION _ngep_try_parse_timestamptz(value TEXT)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    parsed TIMESTAMPTZ;
BEGIN
    IF value IS NULL OR btrim(value) = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        parsed := value::timestamptz;
        RETURN parsed;
    EXCEPTION WHEN others THEN
        BEGIN
            parsed := replace(value, 'Z', '+00:00')::timestamptz;
            RETURN parsed;
        EXCEPTION WHEN others THEN
            RETURN NULL;
        END;
    END;
END;
$$ LANGUAGE plpgsql;
"""
        )
    )

    _convert_log_timestamp_to_timestamptz("system_logs")
    _convert_log_timestamp_to_timestamptz("business_logs")

    op.execute(sa.text("DROP FUNCTION IF EXISTS _ngep_try_parse_timestamptz(TEXT)"))

    op.execute(
        sa.text(
            """
CREATE TABLE IF NOT EXISTS privacy_consents (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255),
    audience VARCHAR(20) NOT NULL,
    policy_version VARCHAR(64) NOT NULL,
    policy_hash VARCHAR(128) NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT TRUE,
    ip_address VARCHAR(64),
    user_agent VARCHAR(512),
    locale VARCHAR(16),
    trace_id VARCHAR(128),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_privacy_consents_username_accepted_at ON privacy_consents (username, accepted_at DESC)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_privacy_consents_policy_version ON privacy_consents (policy_version)"
        )
    )
    op.execute(
        sa.text(
            """
INSERT INTO system_config (key, value)
VALUES
    ('privacy_policy_version', 'v1'),
    ('privacy_policy_required', 'true')
ON CONFLICT (key) DO NOTHING
"""
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM system_config WHERE key IN ('privacy_policy_version', 'privacy_policy_required')"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_privacy_consents_policy_version"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_privacy_consents_username_accepted_at"))
    op.execute(sa.text("DROP TABLE IF EXISTS privacy_consents"))

    _convert_log_timestamp_to_varchar("business_logs")
    _convert_log_timestamp_to_varchar("system_logs")
