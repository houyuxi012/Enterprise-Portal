"""Encrypt legacy plaintext log forwarding secrets.

Revision ID: 20260306_0005
Revises: 20260306_0004
Create Date: 2026-03-06 16:20:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from modules.iam.services.system_config_security import (
    SYSTEM_CONFIG_SECRET_PREFIX,
    encrypt_secret_value,
)


# revision identifiers, used by Alembic.
revision = "20260306_0005"
down_revision = "20260306_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
SELECT id, secret_token
FROM log_forwarding_config
WHERE secret_token IS NOT NULL
  AND secret_token <> ''
"""
        )
    ).mappings()

    for row in rows:
        secret_token = str(row["secret_token"] or "")
        if not secret_token or secret_token.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
            continue

        bind.execute(
            sa.text(
                """
UPDATE log_forwarding_config
SET secret_token = :secret_token
WHERE id = :id
"""
            ),
            {
                "id": row["id"],
                "secret_token": encrypt_secret_value(secret_token),
            },
        )


def downgrade() -> None:
    # Data remains encrypted on downgrade to avoid reintroducing plaintext secrets.
    return None
