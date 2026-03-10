"""backfill user email from employee records

Revision ID: 20260310_0021
Revises: 20260310_0020
Create Date: 2026-03-10 20:35:00.000000
"""

from __future__ import annotations

from alembic import op


revision = "20260310_0021"
down_revision = "20260310_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users AS u
        SET email = e.email
        FROM employees AS e
        WHERE u.username = e.account
          AND u.account_type = 'PORTAL'
          AND (u.email IS NULL OR btrim(u.email) = '')
          AND e.email IS NOT NULL
          AND btrim(e.email) <> ''
          AND NOT EXISTS (
              SELECT 1
              FROM users AS conflict
              WHERE conflict.id <> u.id
                AND conflict.email = e.email
          )
        """
    )


def downgrade() -> None:
    pass
