"""Bind privacy consent evidence to authenticated users.

Revision ID: 20260306_0004
Revises: 20260305_0003
Create Date: 2026-03-06 12:30:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260306_0004"
down_revision = "20260305_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE privacy_consents ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    op.execute(
        sa.text(
            """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_privacy_consents_user_id_users'
    ) THEN
        ALTER TABLE privacy_consents
        ADD CONSTRAINT fk_privacy_consents_user_id_users
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;
"""
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_privacy_consents_user_id_accepted_at ON privacy_consents (user_id, accepted_at DESC)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_privacy_consents_user_audience_policy_hash ON privacy_consents (user_id, audience, policy_hash, accepted_at DESC)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_privacy_consents_user_audience_policy_hash"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_privacy_consents_user_id_accepted_at"))
    op.execute(sa.text("ALTER TABLE privacy_consents DROP CONSTRAINT IF EXISTS fk_privacy_consents_user_id_users"))
    op.execute(sa.text("ALTER TABLE privacy_consents DROP COLUMN IF EXISTS user_id"))
