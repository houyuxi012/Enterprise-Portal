"""create notification templates

Revision ID: 20260309_0014
Revises: 20260308_0013
Create Date: 2026-03-09 10:00:00.000000
"""

from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "20260309_0014"
down_revision = "20260308_0013"
branch_labels = None
depends_on = None


def _seed_rows() -> list[dict[str, object]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "code": "email_verification_code",
            "name": "Email Verification Code",
            "description": "Used for registration, sign-in, and sensitive-operation confirmation emails.",
            "category": "email",
            "subject": "Your verification code",
            "content": "Hello {{user_name}}, your verification code is {{code}}. It expires in {{expires_in_minutes}} minutes.",
            "variables": ["user_name", "code", "expires_in_minutes"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "email_password_reset",
            "name": "Password Reset Email",
            "description": "Used for password recovery and password reset confirmation emails.",
            "category": "email",
            "subject": "Reset your password",
            "content": "Hello {{user_name}}, reset your password with {{reset_link}} before {{expires_at}}.",
            "variables": ["user_name", "reset_link", "expires_at", "product_name"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "email_system_alert",
            "name": "System Alert Email",
            "description": "Used for system incidents, capacity warnings, and degradation notifications.",
            "category": "email",
            "subject": "[{{severity}}] {{module}} alert",
            "content": "Alert: {{summary}}\n\nModule: {{module}}\nSeverity: {{severity}}\nOccurred At: {{occurred_at}}\nDetails: {{details}}",
            "variables": ["summary", "module", "severity", "occurred_at", "details"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "sms_login_verification",
            "name": "SMS Verification Code",
            "description": "Used for portal sign-in and sensitive-operation SMS verification.",
            "category": "sms",
            "subject": None,
            "content": "Verification code: {{code}}. Valid for {{expires_in_minutes}} minutes.",
            "variables": ["code", "expires_in_minutes"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "sms_password_reset_notice",
            "name": "Password Reset SMS",
            "description": "Used for notifying users that their password has been reset.",
            "category": "sms",
            "subject": None,
            "content": "Hi {{user_name}}, your password was reset at {{reset_time}} via {{channel}}.",
            "variables": ["user_name", "reset_time", "channel"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "sms_service_reminder",
            "name": "Service Reminder SMS",
            "description": "Used for pending tasks, approval reminders, and service notifications.",
            "category": "sms",
            "subject": None,
            "content": "{{business_name}} reminder: please complete before {{deadline}}. {{action_hint}}",
            "variables": ["business_name", "deadline", "action_hint", "priority"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "im_ops_alert",
            "name": "Ops Alert Message",
            "description": "Used for bot groups, on-call rooms, and incident broadcasts.",
            "category": "im",
            "subject": None,
            "content": "[{{environment}}] {{summary}}\nOwner: {{owner}}\nHandle: {{action_link}}",
            "variables": ["environment", "summary", "owner", "action_link", "severity"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "im_approval_reminder",
            "name": "Approval Reminder Message",
            "description": "Used for pushing approval reminders and overdue tasks to instant messaging channels.",
            "category": "im",
            "subject": None,
            "content": "{{requester}} submitted {{approval_name}}. Please complete before {{deadline}}.",
            "variables": ["requester", "approval_name", "deadline", "action_link"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "code": "im_sync_failure",
            "name": "Sync Failure Message",
            "description": "Used for directory sync, meeting sync, and job failure notifications.",
            "category": "im",
            "subject": None,
            "content": "{{job_name}} failed. Reason: {{failure_reason}}. Retry Count: {{retry_count}}. Logs: {{log_link}}",
            "variables": ["job_name", "failure_reason", "retry_count", "log_link", "owner", "environment"],
            "is_enabled": True,
            "is_builtin": True,
            "created_at": now,
            "updated_at": now,
        },
    ]


def upgrade() -> None:
    op.create_table(
        "notification_templates",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("code", name="uq_notification_templates_code"),
    )
    op.create_index("ix_notification_templates_category", "notification_templates", ["category"])
    op.create_index("ix_notification_templates_is_enabled", "notification_templates", ["is_enabled"])
    op.create_index("ix_notification_templates_is_builtin", "notification_templates", ["is_builtin"])
    op.create_index("ix_notification_templates_name", "notification_templates", ["name"])

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
    op.bulk_insert(notification_templates, _seed_rows())


def downgrade() -> None:
    op.drop_index("ix_notification_templates_name", table_name="notification_templates")
    op.drop_index("ix_notification_templates_is_builtin", table_name="notification_templates")
    op.drop_index("ix_notification_templates_is_enabled", table_name="notification_templates")
    op.drop_index("ix_notification_templates_category", table_name="notification_templates")
    op.drop_table("notification_templates")
