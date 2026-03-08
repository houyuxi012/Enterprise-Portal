"""Link admin meetings to IAM users.

Revision ID: 20260308_0009
Revises: 20260308_0008
Create Date: 2026-03-08 21:40:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260308_0009"
down_revision = "20260308_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_meetings",
        sa.Column("organizer_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_admin_meetings_organizer_user_id_users",
        "admin_meetings",
        "users",
        ["organizer_user_id"],
        ["id"],
    )
    op.create_index("ix_admin_meetings_organizer_user_id", "admin_meetings", ["organizer_user_id"])

    op.create_table(
        "admin_meeting_attendees",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("admin_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("meeting_id", "user_id", name="uq_admin_meeting_attendees_meeting_user"),
    )
    op.create_index("ix_admin_meeting_attendees_meeting_id", "admin_meeting_attendees", ["meeting_id"])
    op.create_index("ix_admin_meeting_attendees_user_id", "admin_meeting_attendees", ["user_id"])

    op.execute(
        """
        UPDATE admin_meetings AS meeting
        SET organizer_user_id = user_row.id
        FROM users AS user_row
        WHERE meeting.organizer_user_id IS NULL
          AND lower(trim(user_row.username)) = lower(trim(meeting.organizer))
        """
    )
    op.execute(
        """
        UPDATE admin_meetings AS meeting
        SET organizer_user_id = user_row.id
        FROM users AS user_row
        WHERE meeting.organizer_user_id IS NULL
          AND coalesce(trim(user_row.name), '') <> ''
          AND lower(trim(user_row.name)) = lower(trim(meeting.organizer))
        """
    )
    op.execute(
        """
        UPDATE admin_meetings AS meeting
        SET organizer_user_id = user_row.id
        FROM users AS user_row
        WHERE meeting.organizer_user_id IS NULL
          AND meeting.organizer LIKE '% / %'
          AND lower(trim(user_row.username)) = lower(trim(split_part(meeting.organizer, ' / ', 2)))
        """
    )

    op.execute(
        """
        INSERT INTO admin_meeting_attendees (meeting_id, user_id, created_at)
        SELECT DISTINCT meeting.id, user_row.id, NOW()
        FROM admin_meetings AS meeting
        JOIN LATERAL jsonb_array_elements_text(COALESCE(meeting.attendees::jsonb, '[]'::jsonb)) AS attendee(value) ON TRUE
        JOIN users AS user_row ON lower(trim(user_row.username)) = lower(trim(attendee.value))
        LEFT JOIN admin_meeting_attendees AS link
          ON link.meeting_id = meeting.id AND link.user_id = user_row.id
        WHERE link.id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO admin_meeting_attendees (meeting_id, user_id, created_at)
        SELECT DISTINCT meeting.id, user_row.id, NOW()
        FROM admin_meetings AS meeting
        JOIN LATERAL jsonb_array_elements_text(COALESCE(meeting.attendees::jsonb, '[]'::jsonb)) AS attendee(value) ON TRUE
        JOIN users AS user_row
          ON coalesce(trim(user_row.name), '') <> ''
         AND lower(trim(user_row.name)) = lower(trim(attendee.value))
        LEFT JOIN admin_meeting_attendees AS link
          ON link.meeting_id = meeting.id AND link.user_id = user_row.id
        WHERE link.id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO admin_meeting_attendees (meeting_id, user_id, created_at)
        SELECT DISTINCT meeting.id, user_row.id, NOW()
        FROM admin_meetings AS meeting
        JOIN LATERAL jsonb_array_elements_text(COALESCE(meeting.attendees::jsonb, '[]'::jsonb)) AS attendee(value) ON TRUE
        JOIN users AS user_row
          ON attendee.value LIKE '% / %'
         AND lower(trim(user_row.username)) = lower(trim(split_part(attendee.value, ' / ', 2)))
        LEFT JOIN admin_meeting_attendees AS link
          ON link.meeting_id = meeting.id AND link.user_id = user_row.id
        WHERE link.id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_admin_meeting_attendees_user_id", table_name="admin_meeting_attendees")
    op.drop_index("ix_admin_meeting_attendees_meeting_id", table_name="admin_meeting_attendees")
    op.drop_table("admin_meeting_attendees")

    op.drop_index("ix_admin_meetings_organizer_user_id", table_name="admin_meetings")
    op.drop_constraint("fk_admin_meetings_organizer_user_id_users", "admin_meetings", type_="foreignkey")
    op.drop_column("admin_meetings", "organizer_user_id")
