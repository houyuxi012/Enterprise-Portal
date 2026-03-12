"""create holiday reminders

Revision ID: 20260311_0024
Revises: 20260311_0023
Create Date: 2026-03-11 20:55:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260311_0024"
down_revision = "20260311_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "holiday_reminders",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("cover_image", sa.String(length=512), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=False, server_default="purple"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_holiday_reminders_id", "holiday_reminders", ["id"])
    op.create_index("ix_holiday_reminders_holiday_date", "holiday_reminders", ["holiday_date"])
    op.create_index("ix_holiday_reminders_is_active", "holiday_reminders", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_holiday_reminders_is_active", table_name="holiday_reminders")
    op.drop_index("ix_holiday_reminders_holiday_date", table_name="holiday_reminders")
    op.drop_index("ix_holiday_reminders_id", table_name="holiday_reminders")
    op.drop_table("holiday_reminders")
