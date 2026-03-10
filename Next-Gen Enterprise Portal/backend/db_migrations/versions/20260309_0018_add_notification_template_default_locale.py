"""add notification template default locale

Revision ID: 20260309_0018
Revises: 20260309_0017
Create Date: 2026-03-09 23:58:00.000000
"""

from __future__ import annotations

from collections.abc import Mapping

import sqlalchemy as sa
from alembic import op


revision = "20260309_0018"
down_revision = "20260309_0017"
branch_labels = None
depends_on = None


def _normalize_text(value: object | None) -> str:
    return str(value or "").strip()


def _normalize_i18n_map(value: object | None) -> dict[str, str]:
    if not isinstance(value, Mapping):
        return {}
    normalized: dict[str, str] = {}
    for locale, text in value.items():
        locale_value = _normalize_text(locale)
        text_value = _normalize_text(text)
        if locale_value in {"zh-CN", "en-US"} and text_value:
            normalized[locale_value] = text_value
    return normalized


def _guess_default_locale(row: Mapping[str, object]) -> str:
    for field_name in ("content", "subject", "name"):
        fallback_value = _normalize_text(row.get(field_name))
        if not fallback_value:
            continue
        translations = _normalize_i18n_map(row.get(f"{field_name}_i18n"))
        if translations.get("zh-CN") == fallback_value:
            return "zh-CN"
        if translations.get("en-US") == fallback_value:
            return "en-US"
    return "zh-CN"


def upgrade() -> None:
    op.add_column(
        "notification_templates",
        sa.Column("default_locale", sa.String(length=16), nullable=False, server_default="zh-CN"),
    )

    connection = op.get_bind()
    notification_templates = sa.table(
        "notification_templates",
        sa.column("id", sa.Integer()),
        sa.column("name", sa.String(length=128)),
        sa.column("name_i18n", sa.JSON()),
        sa.column("subject", sa.String(length=255)),
        sa.column("subject_i18n", sa.JSON()),
        sa.column("content", sa.Text()),
        sa.column("content_i18n", sa.JSON()),
        sa.column("default_locale", sa.String(length=16)),
    )

    rows = connection.execute(sa.select(notification_templates)).mappings()
    for row in rows:
        connection.execute(
            notification_templates.update()
            .where(notification_templates.c.id == row["id"])
            .values(default_locale=_guess_default_locale(row))
        )

    op.alter_column("notification_templates", "default_locale", server_default=None)


def downgrade() -> None:
    op.drop_column("notification_templates", "default_locale")
