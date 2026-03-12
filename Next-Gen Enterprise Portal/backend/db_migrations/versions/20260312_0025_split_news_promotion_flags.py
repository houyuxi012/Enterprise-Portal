"""split news promotion flags

Revision ID: 20260312_0025
Revises: 20260311_0024
Create Date: 2026-03-12 13:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260312_0025"
down_revision = "20260311_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "news",
        sa.Column("show_in_news_feed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "news",
        sa.Column("show_in_news_center_carousel", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "news",
        sa.Column("show_in_news_center_latest", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_index("ix_news_show_in_news_feed", "news", ["show_in_news_feed"])
    op.create_index("ix_news_show_in_news_center_carousel", "news", ["show_in_news_center_carousel"])
    op.create_index("ix_news_show_in_news_center_latest", "news", ["show_in_news_center_latest"])

    op.execute(
        """
        UPDATE news
        SET
            show_in_news_feed = true,
            show_in_news_center_carousel = true,
            show_in_news_center_latest = true
        WHERE COALESCE(is_top, false) = true
        """
    )

    op.alter_column("news", "show_in_news_feed", server_default=None)
    op.alter_column("news", "show_in_news_center_carousel", server_default=None)
    op.alter_column("news", "show_in_news_center_latest", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_news_show_in_news_center_latest", table_name="news")
    op.drop_index("ix_news_show_in_news_center_carousel", table_name="news")
    op.drop_index("ix_news_show_in_news_feed", table_name="news")
    op.drop_column("news", "show_in_news_center_latest")
    op.drop_column("news", "show_in_news_center_carousel")
    op.drop_column("news", "show_in_news_feed")
