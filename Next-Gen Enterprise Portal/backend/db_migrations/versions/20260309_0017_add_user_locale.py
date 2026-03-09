"""add user locale

Revision ID: 20260309_0017
Revises: 20260309_0016
Create Date: 2026-03-09 23:58:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260309_0017"
down_revision = "20260309_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("locale", sa.String(length=16), nullable=True))
    op.create_check_constraint(
        "ck_users_locale_supported",
        "users",
        "locale IS NULL OR locale IN ('zh-CN', 'en-US')",
    )

    op.execute(
        sa.text(
            """
            WITH latest_locale AS (
                SELECT DISTINCT ON (pc.user_id)
                    pc.user_id,
                    CASE
                        WHEN replace(lower(pc.locale), '_', '-') LIKE 'zh%' THEN 'zh-CN'
                        WHEN replace(lower(pc.locale), '_', '-') LIKE 'en%' THEN 'en-US'
                        ELSE NULL
                    END AS normalized_locale
                FROM privacy_consents pc
                WHERE pc.user_id IS NOT NULL
                  AND coalesce(btrim(pc.locale), '') <> ''
                ORDER BY pc.user_id, pc.accepted_at DESC NULLS LAST, pc.id DESC
            )
            UPDATE users u
            SET locale = latest_locale.normalized_locale
            FROM latest_locale
            WHERE u.id = latest_locale.user_id
              AND latest_locale.normalized_locale IS NOT NULL
              AND coalesce(btrim(u.locale), '') = ''
            """
        )
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_locale_supported", "users", type_="check")
    op.drop_column("users", "locale")
