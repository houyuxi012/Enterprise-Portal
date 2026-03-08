"""Create IAM audit logs table.

Revision ID: 20260306_0007
Revises: 20260306_0006
Create Date: 2026-03-06 20:55:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260306_0007"
down_revision = "20260306_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("iam_audit_logs"):
        op.create_table(
            "iam_audit_logs",
            sa.Column("id", sa.BigInteger(), primary_key=True, nullable=False),
            sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("username", sa.String(length=100), nullable=True),
            sa.Column("action", sa.String(length=100), nullable=True),
            sa.Column("target_type", sa.String(length=50), nullable=True),
            sa.Column("target_id", sa.Integer(), nullable=True),
            sa.Column("target_name", sa.String(length=100), nullable=True),
            sa.Column("result", sa.String(length=20), nullable=True),
            sa.Column("reason", sa.String(length=255), nullable=True),
            sa.Column("detail", sa.JSON(), nullable=True),
            sa.Column("ip_address", sa.String(length=50), nullable=True),
            sa.Column("user_agent", sa.Text(), nullable=True),
            sa.Column("trace_id", sa.String(length=100), nullable=True),
        )

    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_audit_logs_id ON iam_audit_logs (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_audit_logs_timestamp ON iam_audit_logs (timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_audit_logs_user_id ON iam_audit_logs (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_audit_logs_action ON iam_audit_logs (action)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_audit_action_ts ON iam_audit_logs (action, timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_iam_audit_user_ts ON iam_audit_logs (user_id, timestamp)")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("iam_audit_logs"):
        op.drop_table("iam_audit_logs")
