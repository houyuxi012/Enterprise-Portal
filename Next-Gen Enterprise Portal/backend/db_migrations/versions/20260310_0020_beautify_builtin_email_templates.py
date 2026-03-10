"""beautify builtin email notification templates

Revision ID: 20260310_0020
Revises: 20260310_0019
Create Date: 2026-03-10 00:20:00.000000
"""

from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = "20260310_0020"
down_revision = "20260310_0019"
branch_labels = None
depends_on = None


OLD_EMAIL_TEMPLATE_PAYLOADS: dict[str, dict[str, object]] = {
    "email_verification_code": {
        "subject": "Your verification code",
        "content": "Hello {{user_name}}, your verification code is {{code}}. It expires in {{expires_in_minutes}} minutes.",
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
        "subject": "Reset your password",
        "content": "Hello {{user_name}}, reset your password with {{reset_link}} before {{expires_at}}.",
        "subject_i18n": {
            "zh-CN": "重置您的密码",
            "en-US": "Reset your password",
        },
        "content_i18n": {
            "zh-CN": "您好 {{user_name}}，请在 {{expires_at}} 前通过 {{reset_link}} 重置密码。",
            "en-US": "Hello {{user_name}}, reset your password with {{reset_link}} before {{expires_at}}.",
        },
    },
    "email_password_reset_notice": {
        "subject": "Your account password was reset",
        "content": "Hello {{user_name}}, your password was reset at {{reset_time}}. Sign in via {{action_link}}. {{action_hint}}",
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


NEW_EMAIL_TEMPLATE_PAYLOADS: dict[str, dict[str, object]] = {
    "email_verification_code": {
        "content": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">您好 {{user_name}}，</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">我们检测到您正在进行一次需要验证身份的操作，请使用下方验证码完成校验。</p>
<div style="margin:0 0 20px;padding:22px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;text-align:center;">
  <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">验证码</div>
  <div style="margin-top:12px;font-size:34px;font-weight:800;letter-spacing:0.34em;color:#0f172a;">{{code}}</div>
</div>
<p style="margin:0;color:#475569;font-size:14px;line-height:1.75;">该验证码将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。若非您本人操作，请忽略此邮件并尽快检查账号安全。</p>
""".strip(),
        "content_i18n": {
            "zh-CN": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">您好 {{user_name}}，</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">我们检测到您正在进行一次需要验证身份的操作，请使用下方验证码完成校验。</p>
<div style="margin:0 0 20px;padding:22px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;text-align:center;">
  <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">验证码</div>
  <div style="margin-top:12px;font-size:34px;font-weight:800;letter-spacing:0.34em;color:#0f172a;">{{code}}</div>
</div>
<p style="margin:0;color:#475569;font-size:14px;line-height:1.75;">该验证码将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。若非您本人操作，请忽略此邮件并尽快检查账号安全。</p>
""".strip(),
            "en-US": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">Hello {{user_name}},</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">We noticed a verification request for your account. Use the code below to continue.</p>
<div style="margin:0 0 20px;padding:22px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;text-align:center;">
  <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Verification Code</div>
  <div style="margin-top:12px;font-size:34px;font-weight:800;letter-spacing:0.34em;color:#0f172a;">{{code}}</div>
</div>
<p style="margin:0;color:#475569;font-size:14px;line-height:1.75;">This code expires in <strong>{{expires_in_minutes}}</strong> minutes. If you did not request it, ignore this email and review your account security.</p>
""".strip(),
        },
    },
    "email_password_reset": {
        "content": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">您好 {{user_name}}，</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">我们收到了重置 <strong>{{product_name}}</strong> 账号密码的请求。请在 <strong>{{expires_at}}</strong> 前通过下方按钮完成重置。</p>
<div style="margin:0 0 20px;">
  <a href="{{reset_link}}" style="display:inline-block;padding:12px 22px;background:#4f46e5;border-radius:12px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">立即重置密码</a>
</div>
<p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.75;">如果按钮无法打开，请复制以下链接到浏览器中访问：</p>
<p style="margin:0 0 14px;color:#4338ca;font-size:13px;line-height:1.7;word-break:break-all;"><a href="{{reset_link}}" style="color:#4338ca;text-decoration:none;">{{reset_link}}</a></p>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.75;">如果这不是您的操作，请忽略此邮件。</p>
""".strip(),
        "content_i18n": {
            "zh-CN": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">您好 {{user_name}}，</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">我们收到了重置 <strong>{{product_name}}</strong> 账号密码的请求。请在 <strong>{{expires_at}}</strong> 前通过下方按钮完成重置。</p>
<div style="margin:0 0 20px;">
  <a href="{{reset_link}}" style="display:inline-block;padding:12px 22px;background:#4f46e5;border-radius:12px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">立即重置密码</a>
</div>
<p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.75;">如果按钮无法打开，请复制以下链接到浏览器中访问：</p>
<p style="margin:0 0 14px;color:#4338ca;font-size:13px;line-height:1.7;word-break:break-all;"><a href="{{reset_link}}" style="color:#4338ca;text-decoration:none;">{{reset_link}}</a></p>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.75;">如果这不是您的操作，请忽略此邮件。</p>
""".strip(),
            "en-US": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">Hello {{user_name}},</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">We received a request to reset the password for your <strong>{{product_name}}</strong> account. Use the button below before <strong>{{expires_at}}</strong>.</p>
<div style="margin:0 0 20px;">
  <a href="{{reset_link}}" style="display:inline-block;padding:12px 22px;background:#4f46e5;border-radius:12px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Reset Password</a>
</div>
<p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.75;">If the button does not open, copy and paste this link into your browser:</p>
<p style="margin:0 0 14px;color:#4338ca;font-size:13px;line-height:1.7;word-break:break-all;"><a href="{{reset_link}}" style="color:#4338ca;text-decoration:none;">{{reset_link}}</a></p>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.75;">If you did not request this change, you can safely ignore this email.</p>
""".strip(),
        },
    },
    "email_password_reset_notice": {
        "content": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">您好 {{user_name}}，</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">您的账号密码已于 <strong>{{reset_time}}</strong> 被管理员重置。</p>
<div style="margin:0 0 20px;padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;">
  <div style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">后续建议</div>
  <div style="margin:0;color:#475569;font-size:14px;line-height:1.75;">{{action_hint}}</div>
</div>
<div style="margin:0 0 18px;">
  <a href="{{action_link}}" style="display:inline-block;padding:12px 22px;background:#4f46e5;border-radius:12px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">立即登录</a>
</div>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.75;">如果这不是您的预期操作，请立即联系管理员核查账号安全。</p>
""".strip(),
        "content_i18n": {
            "zh-CN": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">您好 {{user_name}}，</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">您的账号密码已于 <strong>{{reset_time}}</strong> 被管理员重置。</p>
<div style="margin:0 0 20px;padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;">
  <div style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">后续建议</div>
  <div style="margin:0;color:#475569;font-size:14px;line-height:1.75;">{{action_hint}}</div>
</div>
<div style="margin:0 0 18px;">
  <a href="{{action_link}}" style="display:inline-block;padding:12px 22px;background:#4f46e5;border-radius:12px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">立即登录</a>
</div>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.75;">如果这不是您的预期操作，请立即联系管理员核查账号安全。</p>
""".strip(),
            "en-US": """
<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.75;">Hello {{user_name}},</p>
<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.75;">Your account password was reset by an administrator at <strong>{{reset_time}}</strong>.</p>
<div style="margin:0 0 20px;padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;">
  <div style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">Recommended next step</div>
  <div style="margin:0;color:#475569;font-size:14px;line-height:1.75;">{{action_hint}}</div>
</div>
<div style="margin:0 0 18px;">
  <a href="{{action_link}}" style="display:inline-block;padding:12px 22px;background:#4f46e5;border-radius:12px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Sign in now</a>
</div>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.75;">If this was unexpected, contact your administrator immediately and review your account security.</p>
""".strip(),
        },
    },
}


def _normalized_text(value: object | None) -> str:
    return str(value or "").strip()


def _normalized_i18n_map(value: object | None) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    normalized: dict[str, str] = {}
    for key, item in value.items():
        locale = str(key or "").strip()
        if not locale:
            continue
        text = _normalized_text(item)
        if text:
            normalized[locale] = text
    return normalized


def _matches_payload(
    row: sa.RowMapping,
    *,
    expected: dict[str, object],
) -> bool:
    return (
        _normalized_text(row["subject"]) == _normalized_text(expected.get("subject"))
        and _normalized_text(row["content"]) == _normalized_text(expected.get("content"))
        and _normalized_i18n_map(row["subject_i18n"]) == _normalized_i18n_map(expected.get("subject_i18n"))
        and _normalized_i18n_map(row["content_i18n"]) == _normalized_i18n_map(expected.get("content_i18n"))
    )


def upgrade() -> None:
    connection = op.get_bind()
    notification_templates = sa.table(
        "notification_templates",
        sa.column("id", sa.Integer()),
        sa.column("code", sa.String(length=64)),
        sa.column("is_builtin", sa.Boolean()),
        sa.column("subject", sa.String(length=255)),
        sa.column("content", sa.Text()),
        sa.column("subject_i18n", sa.JSON()),
        sa.column("content_i18n", sa.JSON()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    rows = connection.execute(
        sa.select(notification_templates).where(
            notification_templates.c.code.in_(tuple(NEW_EMAIL_TEMPLATE_PAYLOADS.keys()))
        )
    ).mappings()

    now = datetime.now(timezone.utc)
    for row in rows:
        code = str(row["code"])
        if not bool(row["is_builtin"]):
            continue
        expected_old = OLD_EMAIL_TEMPLATE_PAYLOADS.get(code)
        next_payload = NEW_EMAIL_TEMPLATE_PAYLOADS.get(code)
        if not expected_old or not next_payload:
            continue
        if not _matches_payload(row, expected=expected_old):
            continue
        connection.execute(
            notification_templates.update()
            .where(notification_templates.c.id == row["id"])
            .values(
                content=next_payload["content"],
                content_i18n=next_payload["content_i18n"],
                updated_at=now,
            )
        )


def downgrade() -> None:
    connection = op.get_bind()
    notification_templates = sa.table(
        "notification_templates",
        sa.column("id", sa.Integer()),
        sa.column("code", sa.String(length=64)),
        sa.column("is_builtin", sa.Boolean()),
        sa.column("subject", sa.String(length=255)),
        sa.column("content", sa.Text()),
        sa.column("subject_i18n", sa.JSON()),
        sa.column("content_i18n", sa.JSON()),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    rows = connection.execute(
        sa.select(notification_templates).where(
            notification_templates.c.code.in_(tuple(NEW_EMAIL_TEMPLATE_PAYLOADS.keys()))
        )
    ).mappings()

    now = datetime.now(timezone.utc)
    for row in rows:
        code = str(row["code"])
        if not bool(row["is_builtin"]):
            continue
        current_payload = NEW_EMAIL_TEMPLATE_PAYLOADS.get(code)
        previous_payload = OLD_EMAIL_TEMPLATE_PAYLOADS.get(code)
        if not current_payload or not previous_payload:
            continue
        if not _matches_payload(row, expected=current_payload):
            continue
        connection.execute(
            notification_templates.update()
            .where(notification_templates.c.id == row["id"])
            .values(
                content=previous_payload["content"],
                content_i18n=previous_payload["content_i18n"],
                updated_at=now,
            )
        )
