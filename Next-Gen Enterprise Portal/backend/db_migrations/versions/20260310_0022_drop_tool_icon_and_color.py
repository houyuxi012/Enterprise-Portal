"""drop legacy tool icon and color columns

Revision ID: 20260310_0022
Revises: 20260310_0021
Create Date: 2026-03-10 20:55:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260310_0022"
down_revision = "20260310_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tools", "icon_name")
    op.drop_column("tools", "color")


def downgrade() -> None:
    op.add_column("tools", sa.Column("color", sa.String(length=32), nullable=True))
    op.add_column("tools", sa.Column("icon_name", sa.String(length=64), nullable=True))
