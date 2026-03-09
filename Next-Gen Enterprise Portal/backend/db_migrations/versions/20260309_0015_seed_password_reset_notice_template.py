"""seed password reset notice template

Revision ID: 20260309_0015
Revises: 20260309_0014
Create Date: 2026-03-09 22:50:00.000000
"""

from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "20260309_0015"
down_revision = "20260309_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    notification_templates = sa.table(
        "notification_templates",
        sa.column("code", sa.String(length=64)),
        sa.column("name", sa.String(length=128)),
        sa.column("description", sa.String(length=255)),
        sa.column("category", sa.String(length=16)),
        sa.column("subject", sa.String(length=255)),
        sa.column("content", sa.Text()),
        sa.column("variables", sa.JSON()),
        sa.column("is_enabled", sa.Boolean()),
        sa.column("is_builtin", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        notification_templates,
        [
            {
                "code": "email_password_reset_notice",
                "name": "Password Reset Notice Email",
                "description": "Used for notifying users that their local password was reset by an administrator.",
                "category": "email",
                "subject": "Your account password was reset",
                "content": (
                    "Hello {{user_name}}, your password was reset at {{reset_time}}. "
                    "Sign in via {{action_link}}. {{action_hint}}"
                ),
                "variables": ["user_name", "reset_time", "action_link", "action_hint", "product_name"],
                "is_enabled": True,
                "is_builtin": True,
                "created_at": now,
                "updated_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM notification_templates WHERE code = :code").bindparams(
            code="email_password_reset_notice"
        )
    )
