"""Create admin meetings table.

Revision ID: 20260306_0006
Revises: 20260306_0005
Create Date: 2026-03-06 20:30:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260306_0006"
down_revision = "20260306_0005"
branch_labels = None
depends_on = None


MEETING_TYPE_VALUES = ("online", "offline")
MEETING_SOURCE_VALUES = ("local", "third_party")


def upgrade() -> None:
    op.create_table(
        "admin_meetings",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("meeting_type", sa.String(length=20), nullable=False),
        sa.Column("meeting_room", sa.String(length=255), nullable=False),
        sa.Column("meeting_id", sa.String(length=128), nullable=False),
        sa.Column("organizer", sa.String(length=255), nullable=False),
        sa.Column("attendees", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("source", sa.String(length=20), nullable=False, server_default=sa.text("'local'")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("duration_minutes > 0", name="ck_admin_meetings_duration_positive"),
        sa.CheckConstraint(
            f"meeting_type IN {MEETING_TYPE_VALUES}",
            name="ck_admin_meetings_type_allowed",
        ),
        sa.CheckConstraint(
            f"source IN {MEETING_SOURCE_VALUES}",
            name="ck_admin_meetings_source_allowed",
        ),
        sa.UniqueConstraint("meeting_id", name="uq_admin_meetings_meeting_id"),
    )
    op.create_index("ix_admin_meetings_subject", "admin_meetings", ["subject"])
    op.create_index("ix_admin_meetings_start_time", "admin_meetings", ["start_time"])
    op.create_index("ix_admin_meetings_meeting_type", "admin_meetings", ["meeting_type"])
    op.create_index("ix_admin_meetings_source", "admin_meetings", ["source"])
    op.create_index("ix_admin_meetings_created_by", "admin_meetings", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_admin_meetings_created_by", table_name="admin_meetings")
    op.drop_index("ix_admin_meetings_source", table_name="admin_meetings")
    op.drop_index("ix_admin_meetings_meeting_type", table_name="admin_meetings")
    op.drop_index("ix_admin_meetings_start_time", table_name="admin_meetings")
    op.drop_index("ix_admin_meetings_subject", table_name="admin_meetings")
    op.drop_table("admin_meetings")
