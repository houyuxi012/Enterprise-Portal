"""Bound critical identity and personnel string columns.

Revision ID: 20260308_0010
Revises: 20260308_0009
Create Date: 2026-03-08 19:40:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260308_0010"
down_revision = "20260308_0009"
branch_labels = None
depends_on = None


COLUMN_LENGTHS: tuple[tuple[str, str, int], ...] = (
    ("departments", "name", 128),
    ("departments", "manager", 128),
    ("departments", "description", 255),
    ("permissions", "code", 128),
    ("permissions", "description", 255),
    ("roles", "code", 128),
    ("roles", "name", 128),
    ("roles", "description", 255),
    ("system_config", "key", 128),
    ("users", "username", 128),
    ("users", "email", 255),
    ("users", "hashed_password", 255),
    ("users", "name", 255),
    ("users", "avatar", 512),
    ("user_password_history", "hashed_password", 255),
    ("employees", "account", 128),
    ("employees", "job_number", 64),
    ("employees", "name", 128),
    ("employees", "gender", 16),
    ("employees", "department", 128),
    ("employees", "role", 128),
    ("employees", "email", 255),
    ("employees", "phone", 32),
    ("employees", "location", 255),
    ("employees", "avatar", 512),
    ("employees", "status", 32),
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
    for table_name, column_name, max_length in COLUMN_LENGTHS:
        _validate_existing_lengths(bind, table_name, column_name, max_length)
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(),
            type_=sa.String(length=max_length),
        )


def downgrade() -> None:
    for table_name, column_name, _ in reversed(COLUMN_LENGTHS):
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.String(),
            type_=sa.String(),
        )
