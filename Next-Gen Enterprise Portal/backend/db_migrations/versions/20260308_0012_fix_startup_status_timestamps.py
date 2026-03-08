"""Use timezone-aware timestamps for system startup status.

Revision ID: 20260308_0012
Revises: 20260308_0011
Create Date: 2026-03-08 20:35:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260308_0012"
down_revision = "20260308_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
ALTER TABLE system_startup_status
ALTER COLUMN started_at TYPE TIMESTAMPTZ
USING CASE
    WHEN started_at IS NULL THEN NULL
    ELSE started_at AT TIME ZONE 'UTC'
END
"""
        )
    )
    op.execute(
        sa.text(
            """
ALTER TABLE system_startup_status
ALTER COLUMN finished_at TYPE TIMESTAMPTZ
USING CASE
    WHEN finished_at IS NULL THEN NULL
    ELSE finished_at AT TIME ZONE 'UTC'
END
"""
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
ALTER TABLE system_startup_status
ALTER COLUMN finished_at TYPE TIMESTAMP
USING CASE
    WHEN finished_at IS NULL THEN NULL
    ELSE finished_at AT TIME ZONE 'UTC'
END
"""
        )
    )
    op.execute(
        sa.text(
            """
ALTER TABLE system_startup_status
ALTER COLUMN started_at TYPE TIMESTAMP
USING CASE
    WHEN started_at IS NULL THEN NULL
    ELSE started_at AT TIME ZONE 'UTC'
END
"""
        )
    )
