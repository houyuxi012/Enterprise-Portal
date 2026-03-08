"""Bound operational and content string columns.

Revision ID: 20260308_0011
Revises: 20260308_0010
Create Date: 2026-03-08 20:10:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260308_0011"
down_revision = "20260308_0010"
branch_labels = None
depends_on = None


BOUNDED_COLUMNS: tuple[tuple[str, str, int], ...] = (
    ("system_logs", "level", 20),
    ("system_logs", "module", 100),
    ("system_logs", "ip_address", 45),
    ("system_logs", "request_path", 2048),
    ("system_logs", "method", 16),
    ("system_logs", "user_agent", 512),
    ("business_logs", "operator", 255),
    ("business_logs", "action", 128),
    ("business_logs", "target", 255),
    ("business_logs", "ip_address", 45),
    ("business_logs", "status", 20),
    ("business_logs", "trace_id", 128),
    ("business_logs", "source", 32),
    ("business_logs", "domain", 32),
    ("log_forwarding_config", "type", 32),
    ("log_forwarding_config", "endpoint", 1024),
    ("ai_providers", "name", 128),
    ("ai_providers", "type", 32),
    ("ai_providers", "model_kind", 32),
    ("ai_providers", "base_url", 1024),
    ("ai_providers", "model", 128),
    ("ai_security_policies", "name", 128),
    ("ai_security_policies", "type", 32),
    ("ai_security_policies", "action", 32),
    ("ai_model_quotas", "model_name", 128),
    ("news", "title", 255),
    ("news", "category", 64),
    ("news", "author", 128),
    ("news", "image", 512),
    ("tools", "name", 128),
    ("tools", "icon_name", 64),
    ("tools", "url", 1024),
    ("tools", "color", 32),
    ("tools", "category", 64),
    ("tools", "description", 255),
    ("tools", "image", 512),
    ("announcements", "tag", 64),
    ("announcements", "title", 255),
    ("announcements", "time", 64),
    ("announcements", "color", 32),
    ("notifications", "title", 255),
    ("notifications", "action_url", 1024),
    ("carousel_items", "title", 255),
    ("carousel_items", "image", 512),
    ("carousel_items", "url", 1024),
    ("carousel_items", "badge", 64),
    ("file_metadata", "original_name", 255),
    ("file_metadata", "stored_name", 255),
    ("file_metadata", "bucket", 128),
    ("file_metadata", "content_type", 255),
    ("kb_documents", "title", 255),
    ("kb_chunks", "section", 255),
    ("todos", "title", 255),
    ("todos", "status", 32),
)

TEXT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("system_config", "value"),
    ("log_forwarding_config", "secret_token"),
    ("log_forwarding_config", "log_types"),
    ("ai_providers", "api_key"),
)


def _validate_existing_lengths(bind, table_name: str, column_name: str, max_length: int) -> None:
    max_seen = bind.execute(
        sa.text(
            f'SELECT COALESCE(MAX(char_length("{column_name}")), 0) '
            f'FROM "{table_name}" '
            f'WHERE "{column_name}" IS NOT NULL'
        )
    ).scalar_one()
    if int(max_seen or 0) > max_length:
        raise RuntimeError(
            f"Cannot shrink {table_name}.{column_name} to VARCHAR({max_length}); "
            f"found existing length {max_seen}."
        )


def upgrade() -> None:
    bind = op.get_bind()
    for table_name, column_name, max_length in BOUNDED_COLUMNS:
        _validate_existing_lengths(bind, table_name, column_name, max_length)
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(),
            type_=sa.String(length=max_length),
        )

    for table_name, column_name in TEXT_COLUMNS:
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(),
            type_=sa.Text(),
        )


def downgrade() -> None:
    for table_name, column_name in reversed(TEXT_COLUMNS):
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.Text(),
            type_=sa.String(),
        )

    for table_name, column_name, _ in reversed(BOUNDED_COLUMNS):
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(),
            type_=sa.String(),
        )
