"""add notification template i18n fields

Revision ID: 20260309_0016
Revises: 20260309_0015
Create Date: 2026-03-09 23:40:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260309_0016"
down_revision = "20260309_0015"
branch_labels = None
depends_on = None

SUPPORTED_LOCALES = ("zh-CN", "en-US")
BUILTIN_TRANSLATIONS: dict[str, dict[str, dict[str, str]]] = {
    "email_verification_code": {
        "name_i18n": {
            "zh-CN": "邮箱验证码",
            "en-US": "Email Verification Code",
        },
        "description_i18n": {
            "zh-CN": "用于注册、登录和敏感操作确认邮件。",
            "en-US": "Used for registration, sign-in, and sensitive-operation confirmation emails.",
        },
        "subject_i18n": {
            "zh-CN": "您的验证码",
            "en-US": "Your verification code",
        },
        "content_i18n": {
            "zh-CN": "您好 {{user_name}}，您的验证码是 {{code}}，{{expires_in_minutes}} 分钟内有效。",
            "en-US": "Hello {{user_name}}, your verification code is {{code}}. It expires in {{expires_in_minutes}} minutes.",
        },
    },
    "email_password_reset": {
        "name_i18n": {
            "zh-CN": "密码重置邮件",
            "en-US": "Password Reset Email",
        },
        "description_i18n": {
            "zh-CN": "用于密码找回和密码重置确认邮件。",
            "en-US": "Used for password recovery and password reset confirmation emails.",
        },
        "subject_i18n": {
            "zh-CN": "重置您的密码",
            "en-US": "Reset your password",
        },
        "content_i18n": {
            "zh-CN": "您好 {{user_name}}，请在 {{expires_at}} 前通过 {{reset_link}} 重置密码。",
            "en-US": "Hello {{user_name}}, reset your password with {{reset_link}} before {{expires_at}}.",
        },
    },
    "email_system_alert": {
        "name_i18n": {
            "zh-CN": "系统告警邮件",
            "en-US": "System Alert Email",
        },
        "description_i18n": {
            "zh-CN": "用于系统故障、容量预警和服务降级通知。",
            "en-US": "Used for system incidents, capacity warnings, and degradation notifications.",
        },
        "subject_i18n": {
            "zh-CN": "【{{severity}}】{{module}} 告警",
            "en-US": "[{{severity}}] {{module}} alert",
        },
        "content_i18n": {
            "zh-CN": "告警摘要：{{summary}}\n\n模块：{{module}}\n严重级别：{{severity}}\n发生时间：{{occurred_at}}\n详情：{{details}}",
            "en-US": "Alert: {{summary}}\n\nModule: {{module}}\nSeverity: {{severity}}\nOccurred At: {{occurred_at}}\nDetails: {{details}}",
        },
    },
    "sms_login_verification": {
        "name_i18n": {
            "zh-CN": "短信验证码",
            "en-US": "SMS Verification Code",
        },
        "description_i18n": {
            "zh-CN": "用于门户登录和敏感操作短信验证。",
            "en-US": "Used for portal sign-in and sensitive-operation SMS verification.",
        },
        "content_i18n": {
            "zh-CN": "验证码：{{code}}，{{expires_in_minutes}} 分钟内有效。",
            "en-US": "Verification code: {{code}}. Valid for {{expires_in_minutes}} minutes.",
        },
    },
    "sms_password_reset_notice": {
        "name_i18n": {
            "zh-CN": "密码重置短信",
            "en-US": "Password Reset SMS",
        },
        "description_i18n": {
            "zh-CN": "用于通知用户密码已被重置。",
            "en-US": "Used for notifying users that their password has been reset.",
        },
        "content_i18n": {
            "zh-CN": "您好 {{user_name}}，您的密码已在 {{reset_time}} 通过 {{channel}} 重置。",
            "en-US": "Hi {{user_name}}, your password was reset at {{reset_time}} via {{channel}}.",
        },
    },
    "sms_service_reminder": {
        "name_i18n": {
            "zh-CN": "服务提醒短信",
            "en-US": "Service Reminder SMS",
        },
        "description_i18n": {
            "zh-CN": "用于待办任务、审批提醒和服务通知。",
            "en-US": "Used for pending tasks, approval reminders, and service notifications.",
        },
        "content_i18n": {
            "zh-CN": "{{business_name}} 提醒：请在 {{deadline}} 前处理。{{action_hint}}",
            "en-US": "{{business_name}} reminder: please complete before {{deadline}}. {{action_hint}}",
        },
    },
    "im_ops_alert": {
        "name_i18n": {
            "zh-CN": "运维告警消息",
            "en-US": "Ops Alert Message",
        },
        "description_i18n": {
            "zh-CN": "用于机器人群、值班群和故障广播。",
            "en-US": "Used for bot groups, on-call rooms, and incident broadcasts.",
        },
        "content_i18n": {
            "zh-CN": "【{{environment}}】{{summary}}\n负责人：{{owner}}\n处理入口：{{action_link}}",
            "en-US": "[{{environment}}] {{summary}}\nOwner: {{owner}}\nHandle: {{action_link}}",
        },
    },
    "im_approval_reminder": {
        "name_i18n": {
            "zh-CN": "审批提醒消息",
            "en-US": "Approval Reminder Message",
        },
        "description_i18n": {
            "zh-CN": "用于向即时通讯渠道推送审批提醒和超时任务。",
            "en-US": "Used for pushing approval reminders and overdue tasks to instant messaging channels.",
        },
        "content_i18n": {
            "zh-CN": "{{requester}} 提交了 {{approval_name}}，请在 {{deadline}} 前完成处理。",
            "en-US": "{{requester}} submitted {{approval_name}}. Please complete before {{deadline}}.",
        },
    },
    "im_sync_failure": {
        "name_i18n": {
            "zh-CN": "同步失败消息",
            "en-US": "Sync Failure Message",
        },
        "description_i18n": {
            "zh-CN": "用于目录同步、会议同步和任务失败通知。",
            "en-US": "Used for directory sync, meeting sync, and job failure notifications.",
        },
        "content_i18n": {
            "zh-CN": "{{job_name}} 执行失败。原因：{{failure_reason}}。重试次数：{{retry_count}}。日志：{{log_link}}",
            "en-US": "{{job_name}} failed. Reason: {{failure_reason}}. Retry Count: {{retry_count}}. Logs: {{log_link}}",
        },
    },
    "email_password_reset_notice": {
        "name_i18n": {
            "zh-CN": "密码重置通知邮件",
            "en-US": "Password Reset Notice Email",
        },
        "description_i18n": {
            "zh-CN": "用于通知用户本地密码已被管理员重置。",
            "en-US": "Used for notifying users that their local password was reset by an administrator.",
        },
        "subject_i18n": {
            "zh-CN": "您的账号密码已被重置",
            "en-US": "Your account password was reset",
        },
        "content_i18n": {
            "zh-CN": "您好 {{user_name}}，您的密码已于 {{reset_time}} 被重置。请通过 {{action_link}} 登录。{{action_hint}}",
            "en-US": "Hello {{user_name}}, your password was reset at {{reset_time}}. Sign in via {{action_link}}. {{action_hint}}",
        },
    },
}


def _with_defaults(base_value: str | None) -> dict[str, str]:
    normalized = str(base_value or "").strip()
    if not normalized:
        return {}
    return {locale: normalized for locale in SUPPORTED_LOCALES}


def upgrade() -> None:
    op.add_column(
        "notification_templates",
        sa.Column("name_i18n", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.add_column(
        "notification_templates",
        sa.Column("description_i18n", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.add_column(
        "notification_templates",
        sa.Column("subject_i18n", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.add_column(
        "notification_templates",
        sa.Column("content_i18n", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )

    connection = op.get_bind()
    notification_templates = sa.table(
        "notification_templates",
        sa.column("id", sa.Integer()),
        sa.column("code", sa.String(length=64)),
        sa.column("name", sa.String(length=128)),
        sa.column("description", sa.String(length=255)),
        sa.column("subject", sa.String(length=255)),
        sa.column("content", sa.Text()),
        sa.column("name_i18n", sa.JSON()),
        sa.column("description_i18n", sa.JSON()),
        sa.column("subject_i18n", sa.JSON()),
        sa.column("content_i18n", sa.JSON()),
    )
    rows = connection.execute(sa.select(notification_templates)).mappings()

    for row in rows:
        translations = BUILTIN_TRANSLATIONS.get(str(row["code"]), {})
        name_i18n = translations.get("name_i18n") or _with_defaults(row["name"])
        description_i18n = translations.get("description_i18n") or _with_defaults(row["description"])
        subject_i18n = translations.get("subject_i18n") or _with_defaults(row["subject"])
        content_i18n = translations.get("content_i18n") or _with_defaults(row["content"])
        connection.execute(
            notification_templates.update()
            .where(notification_templates.c.id == row["id"])
            .values(
                name_i18n=name_i18n,
                description_i18n=description_i18n,
                subject_i18n=subject_i18n,
                content_i18n=content_i18n,
            )
        )

    op.alter_column("notification_templates", "name_i18n", server_default=None)
    op.alter_column("notification_templates", "description_i18n", server_default=None)
    op.alter_column("notification_templates", "subject_i18n", server_default=None)
    op.alter_column("notification_templates", "content_i18n", server_default=None)


def downgrade() -> None:
    op.drop_column("notification_templates", "content_i18n")
    op.drop_column("notification_templates", "subject_i18n")
    op.drop_column("notification_templates", "description_i18n")
    op.drop_column("notification_templates", "name_i18n")
