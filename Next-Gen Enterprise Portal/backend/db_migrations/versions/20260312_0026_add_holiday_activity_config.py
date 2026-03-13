"""add holiday activity config

Revision ID: 20260312_0026
Revises: 20260312_0025
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa


revision = "20260312_0026"
down_revision = "20260312_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "holiday_reminders",
        sa.Column("activity_mode", sa.String(length=32), nullable=False, server_default="off"),
    )
    op.add_column(
        "holiday_reminders",
        sa.Column("activity_url", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "holiday_reminders",
        sa.Column("local_content_config", sa.JSON(), nullable=True),
    )
    op.create_index("ix_holiday_reminders_activity_mode", "holiday_reminders", ["activity_mode"])
    op.execute("UPDATE holiday_reminders SET activity_mode = 'off' WHERE activity_mode IS NULL")
    op.alter_column("holiday_reminders", "activity_mode", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_holiday_reminders_activity_mode", table_name="holiday_reminders")
    op.drop_column("holiday_reminders", "local_content_config")
    op.drop_column("holiday_reminders", "activity_url")
    op.drop_column("holiday_reminders", "activity_mode")
