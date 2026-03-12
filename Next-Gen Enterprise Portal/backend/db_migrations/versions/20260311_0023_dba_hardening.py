"""DBA hardening: CASCADE, constraints, column types, SystemConfig fields

Revision ID: 20260311_0023
Revises: 20260310_0022
Create Date: 2026-03-11 18:55:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260311_0023"
down_revision = "20260310_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── D1: Add CASCADE to user_roles / role_permissions ─────────────────
    # Drop existing FK constraints and re-create with ON DELETE CASCADE.
    # Constraint names follow SQLAlchemy's auto-naming convention.
    with op.batch_alter_table("user_roles") as batch_op:
        batch_op.drop_constraint("user_roles_user_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("user_roles_role_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "user_roles_user_id_fkey", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_foreign_key(
            "user_roles_role_id_fkey", "roles", ["role_id"], ["id"], ondelete="CASCADE"
        )

    with op.batch_alter_table("role_permissions") as batch_op:
        batch_op.drop_constraint("role_permissions_role_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("role_permissions_permission_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "role_permissions_role_id_fkey", "roles", ["role_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_foreign_key(
            "role_permissions_permission_id_fkey", "permissions", ["permission_id"], ["id"], ondelete="CASCADE"
        )

    # ── D2: Announcement.time  VARCHAR(64) → TIMESTAMPTZ ─────────────────
    # Only parse ISO-like timestamps/dates. Human-readable relative strings
    # such as "刚才" are legacy presentation values and cannot be cast safely.
    op.execute(
        "ALTER TABLE announcements "
        "ALTER COLUMN \"time\" TYPE TIMESTAMP WITH TIME ZONE "
        "USING CASE "
        "WHEN \"time\" IS NULL OR btrim(\"time\") = '' THEN NULL "
        "WHEN btrim(\"time\") ~ '^\\d{4}-\\d{2}-\\d{2}( \\d{2}:\\d{2}(:\\d{2})?)?$' "
        "THEN btrim(\"time\")::timestamp with time zone "
        "ELSE NULL END"
    )

    # ── D3: departments — unique (name, parent_id) ───────────────────────
    op.create_unique_constraint(
        "uq_department_name_parent", "departments", ["name", "parent_id"]
    )

    # ── D4: system_config — add value_type and updated_at ────────────────
    op.add_column(
        "system_config",
        sa.Column("value_type", sa.String(20), nullable=False, server_default="string"),
    )
    op.add_column(
        "system_config",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    # D4
    op.drop_column("system_config", "updated_at")
    op.drop_column("system_config", "value_type")

    # D3
    op.drop_constraint("uq_department_name_parent", "departments", type_="unique")

    # D2 — revert to VARCHAR(64)
    op.execute(
        "ALTER TABLE announcements "
        "ALTER COLUMN \"time\" TYPE VARCHAR(64) "
        "USING CASE WHEN \"time\" IS NOT NULL "
        "THEN to_char(\"time\", 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END"
    )

    # D1
    with op.batch_alter_table("role_permissions") as batch_op:
        batch_op.drop_constraint("role_permissions_permission_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("role_permissions_role_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "role_permissions_role_id_fkey", "roles", ["role_id"], ["id"]
        )
        batch_op.create_foreign_key(
            "role_permissions_permission_id_fkey", "permissions", ["permission_id"], ["id"]
        )

    with op.batch_alter_table("user_roles") as batch_op:
        batch_op.drop_constraint("user_roles_role_id_fkey", type_="foreignkey")
        batch_op.drop_constraint("user_roles_user_id_fkey", type_="foreignkey")
        batch_op.create_foreign_key(
            "user_roles_user_id_fkey", "users", ["user_id"], ["id"]
        )
        batch_op.create_foreign_key(
            "user_roles_role_id_fkey", "roles", ["role_id"], ["id"]
        )
