"""Promote high-volume log and audit table ids to BIGINT.

Revision ID: 20260308_0008
Revises: 20260306_0007
Create Date: 2026-03-08 11:40:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260308_0008"
down_revision = "20260306_0007"
branch_labels = None
depends_on = None


TARGET_TABLES = (
    "system_logs",
    "business_logs",
    "ai_audit_log",
    "notification_receipts",
    "kb_chunks",
    "kb_query_logs",
    "iam_audit_logs",
)


def _id_is_bigint(inspector: sa.Inspector, table_name: str) -> bool:
    for column in inspector.get_columns(table_name):
        if column.get("name") != "id":
            continue
        return "BIGINT" in str(column.get("type")).upper()
    return False


def _alter_id_type(table_name: str, target_type: str) -> None:
    op.execute(sa.text(f'ALTER TABLE "{table_name}" ALTER COLUMN id TYPE {target_type}'))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in TARGET_TABLES:
        if not inspector.has_table(table_name):
            continue
        if _id_is_bigint(inspector, table_name):
            continue
        _alter_id_type(table_name, "BIGINT")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in TARGET_TABLES:
        if not inspector.has_table(table_name):
            continue
        if not _id_is_bigint(inspector, table_name):
            continue
        _alter_id_type(table_name, "INTEGER")
