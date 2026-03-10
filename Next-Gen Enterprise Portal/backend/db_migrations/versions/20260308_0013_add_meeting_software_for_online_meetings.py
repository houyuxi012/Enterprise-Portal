"""Split online meeting software from offline meeting room.

Revision ID: 20260308_0013
Revises: 20260308_0012
Create Date: 2026-03-08 22:45:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260308_0013"
down_revision = "20260308_0012"
branch_labels = None
depends_on = None


CHANNEL_FIELD_CONSTRAINT = """
(
    meeting_type = 'online'
    AND meeting_software IS NOT NULL
    AND BTRIM(meeting_software) <> ''
    AND meeting_room IS NULL
)
OR
(
    meeting_type = 'offline'
    AND meeting_room IS NOT NULL
    AND BTRIM(meeting_room) <> ''
    AND (
        meeting_software IS NULL
        OR BTRIM(meeting_software) = ''
    )
)
"""


def upgrade() -> None:
    op.add_column("admin_meetings", sa.Column("meeting_software", sa.String(length=128), nullable=True))
    op.alter_column(
        "admin_meetings",
        "meeting_room",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.execute(
        sa.text(
            """
UPDATE admin_meetings
SET
    meeting_software = NULLIF(BTRIM(meeting_room), ''),
    meeting_room = NULL
WHERE meeting_type = 'online'
  AND NULLIF(BTRIM(COALESCE(meeting_room, '')), '') IS NOT NULL
"""
        )
    )
    op.execute(
        sa.text(
            """
UPDATE admin_meetings
SET meeting_software = NULL
WHERE meeting_type = 'offline'
"""
        )
    )
    op.create_check_constraint(
        "ck_admin_meetings_channel_fields",
        "admin_meetings",
        CHANNEL_FIELD_CONSTRAINT,
    )


def downgrade() -> None:
    op.drop_constraint("ck_admin_meetings_channel_fields", "admin_meetings", type_="check")
    op.execute(
        sa.text(
            """
UPDATE admin_meetings
SET meeting_room = COALESCE(NULLIF(BTRIM(meeting_room), ''), NULLIF(BTRIM(meeting_software), ''))
WHERE meeting_type = 'online'
"""
        )
    )
    op.drop_column("admin_meetings", "meeting_software")
    op.alter_column(
        "admin_meetings",
        "meeting_room",
        existing_type=sa.String(length=255),
        nullable=False,
    )
