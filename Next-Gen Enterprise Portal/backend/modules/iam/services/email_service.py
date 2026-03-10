"""
Async Email Service – reads SMTP config from SystemConfig table.

SystemConfig keys used:
  smtp_host, smtp_port, smtp_username, smtp_password,
  smtp_use_tls (bool), smtp_sender (email address)
"""
from __future__ import annotations

import logging
import secrets
import string
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from html import escape
from typing import Mapping, Optional

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
from infrastructure.cache_manager import CacheManager
from modules.admin.services.notification_templates import (
    build_branded_email_html,
    build_notification_sample_context,
    fetch_notification_template_by_code,
    get_notification_email_branding,
    normalize_notification_template_locale,
    render_notification_template,
)
from modules.iam.services.system_config_security import decrypt_system_config_map

logger = logging.getLogger("email_service")

EMAIL_OTP_TTL = 300  # 5 minutes
EMAIL_OTP_PREFIX = "email_otp:"
EMAIL_OTP_LAST_SEND_PREFIX = "email_otp:last_send:"
EMAIL_OTP_FAIL_PREFIX = "email_otp:fail:"
EMAIL_OTP_MIN_SEND_INTERVAL = 60  # 60 seconds
EMAIL_OTP_MAX_VERIFY_ATTEMPTS = 5
DEFAULT_PORTAL_LOGIN_URL = "https://portal.example.com/login"


def _resolve_password_reset_notice_action_link(
    action_link: str | None,
    *,
    email_branding: Mapping[str, object] | None = None,
) -> str:
    explicit_action_link = str(action_link or "").strip()
    if explicit_action_link:
        return explicit_action_link
    branding_public_base_url = str((email_branding or {}).get("public_base_url") or "").strip().rstrip("/")
    if branding_public_base_url:
        return branding_public_base_url
    return DEFAULT_PORTAL_LOGIN_URL


def _resolve_mail_locale(locale: str | None) -> str:
    return normalize_notification_template_locale(locale) or "zh-CN"


def _generate_otp(length: int = 6) -> str:
    # Use cryptographically secure randomness for one-time verification code.
    return "".join(secrets.choice(string.digits) for _ in range(length))


async def _get_smtp_config(db: AsyncSession) -> dict:
    result = await db.execute(select(models.SystemConfig))
    all_cfg = decrypt_system_config_map({c.key: c.value for c in result.scalars().all()})
    return {
        "host": all_cfg.get("smtp_host", ""),
        "port": int(all_cfg.get("smtp_port", "465")),
        "username": all_cfg.get("smtp_username", ""),
        "password": all_cfg.get("smtp_password", ""),
        "use_tls": str(all_cfg.get("smtp_use_tls", "true")).lower() == "true",
        "sender": all_cfg.get("smtp_sender", all_cfg.get("smtp_username", "")),
    }


def _resolve_smtp_transport_options(cfg: dict) -> dict[str, bool]:
    tls_enabled = bool(cfg.get("use_tls"))
    port = int(cfg.get("port") or 0)
    implicit_tls = tls_enabled and port == 465
    return {
        "use_tls": implicit_tls,
        "start_tls": tls_enabled and not implicit_tls,
    }


async def send_email_message(
    to_email: str,
    subject: str,
    db: AsyncSession,
    *,
    text_body: str | None = None,
    html_body: str | None = None,
) -> None:
    cfg = await _get_smtp_config(db)
    if not cfg["host"] or not cfg["username"]:
        raise ValueError("SMTP 未配置，请在后台系统设置中配置邮件服务器。")

    normalized_text = str(text_body or "").strip()
    normalized_html = str(html_body or "").strip()
    if not normalized_text and normalized_html:
        normalized_text = normalized_html
    if not normalized_html and normalized_text:
        normalized_html = (
            "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
            "padding:24px;white-space:pre-wrap;line-height:1.7;color:#1e293b\">"
            f"{escape(normalized_text)}"
            "</div>"
        )

    msg = MIMEMultipart("alternative")
    msg["From"] = cfg["sender"]
    msg["To"] = to_email
    msg["Subject"] = subject
    if normalized_text:
        msg.attach(MIMEText(normalized_text, "plain", "utf-8"))
    if normalized_html:
        msg.attach(MIMEText(normalized_html, "html", "utf-8"))

    try:
        transport_options = _resolve_smtp_transport_options(cfg)
        await aiosmtplib.send(
            msg,
            hostname=cfg["host"],
            port=cfg["port"],
            username=cfg["username"],
            password=cfg["password"],
            use_tls=transport_options["use_tls"],
            start_tls=transport_options["start_tls"],
        )
        logger.info("Email sent to %s with subject=%s", to_email, subject)
    except Exception as e:
        logger.error("Failed to send email: %s", e)
        raise ValueError(f"邮件发送失败: {e}")


async def send_email_otp(
    to_email: str,
    username: str,
    db: AsyncSession,
    *,
    locale: str | None = None,
) -> str:
    """Generate OTP, store in Redis/memory cache, and send via SMTP.
    Returns the OTP code (for testing; production should not expose this).
    """
    code = _generate_otp()

    # Store in cache
    cache = CacheManager()
    cache_key = f"{EMAIL_OTP_PREFIX}{username}"
    last_send_key = f"{EMAIL_OTP_LAST_SEND_PREFIX}{username}"
    fail_key = f"{EMAIL_OTP_FAIL_PREFIX}{username}"
    recent_send = await cache.get(last_send_key)
    if recent_send is not None:
        raise ValueError("验证码发送过于频繁，请稍后重试。")
    await cache.set(cache_key, code, ttl=EMAIL_OTP_TTL)
    await cache.set(last_send_key, "1", ttl=EMAIL_OTP_MIN_SEND_INTERVAL)
    await cache.delete(fail_key)

    resolved_locale = _resolve_mail_locale(locale)
    email_branding = await get_notification_email_branding(db)
    template = await fetch_notification_template_by_code(
        db,
        code="email_verification_code",
        channel="email",
        enabled_only=True,
    )
    if template is not None:
        rendered = render_notification_template(
            template,
            build_notification_sample_context(
                current_user=None,
                channel="email",
                recipient=to_email,
                public_base_url=email_branding.get("public_base_url"),
            )
            | {
                "user_name": username,
                "username": username,
                "code": code,
                "expires_in_minutes": str(EMAIL_OTP_TTL // 60),
            },
            locale=resolved_locale,
            email_branding=email_branding,
        )
        fallback_subject = (
            "Email verification code - Enterprise Portal"
            if resolved_locale == "en-US"
            else "登录验证码 - Enterprise Portal"
        )
        subject = str(rendered["subject"] or fallback_subject).strip() or fallback_subject
        text = str(rendered["content"] or "").strip()
        html = str(rendered.get("html_content") or "").strip() or None
    else:
        if resolved_locale == "en-US":
            subject = "Email verification code - Enterprise Portal"
            text = f"Hello {username}, your email verification code is {code}. It is valid for {EMAIL_OTP_TTL // 60} minutes."
            html = build_branded_email_html(
                subject=subject,
                body_html=(
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'Hello <strong>{escape(username)}</strong>,</p>'
                    '<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.75;">'
                    'Your email verification code is:</p>'
                    '<div style="display:inline-block;margin:0 0 20px;padding:16px 28px;background:#eff6ff;'
                    'border-radius:16px;border:1px solid #bfdbfe;letter-spacing:0.4em;font-size:32px;'
                    'font-weight:800;color:#1d4ed8;">'
                    f'{escape(code)}</div>'
                    f'<p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">'
                    f'The code is valid for {EMAIL_OTP_TTL // 60} minutes. Do not share it.</p>'
                ),
                branding=email_branding,
            )
        else:
            subject = "登录验证码 - Enterprise Portal"
            text = f"{username}，您好。您的邮箱验证码是 {code}，{EMAIL_OTP_TTL // 60} 分钟内有效。"
            html = build_branded_email_html(
                subject=subject,
                body_html=(
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'您好，<strong>{escape(username)}</strong></p>'
                    '<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.75;">'
                    '您的邮箱验证码为：</p>'
                    '<div style="display:inline-block;margin:0 0 20px;padding:16px 28px;background:#eff6ff;'
                    'border-radius:16px;border:1px solid #bfdbfe;letter-spacing:0.4em;font-size:32px;'
                    'font-weight:800;color:#1d4ed8;">'
                    f'{escape(code)}</div>'
                    f'<p style="margin:0;color:#64748b;font-size:13px;line-height:1.7;">'
                    f'验证码 {EMAIL_OTP_TTL // 60} 分钟内有效，请勿泄露给他人。</p>'
                ),
                branding=email_branding,
            )
    await send_email_message(
        to_email,
        subject,
        db,
        text_body=text,
        html_body=html,
    )
    logger.info("Email OTP sent to %s for user %s", to_email, username)

    return code


async def send_password_reset_notice(
    to_email: str,
    username: str,
    db: AsyncSession,
    *,
    action_link: str | None = None,
    force_change_password: bool = False,
    locale: str | None = None,
) -> None:
    reset_time = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
    resolved_locale = _resolve_mail_locale(locale)
    email_branding = await get_notification_email_branding(db)
    template = await fetch_notification_template_by_code(
        db,
        code="email_password_reset_notice",
        channel="email",
        enabled_only=True,
    )
    effective_action_link = _resolve_password_reset_notice_action_link(
        action_link,
        email_branding=email_branding,
    )
    action_hint = (
        (
            "Please sign in with the password provided by your administrator and update it immediately."
            if resolved_locale == "en-US"
            else "请使用管理员提供的密码登录，并立即完成密码修改。"
        )
        if force_change_password
        else (
            "If this action was unexpected, please contact your administrator immediately."
            if resolved_locale == "en-US"
            else "如果这不是您的预期操作，请立即联系管理员。"
        )
    )

    if template is not None:
        rendered = render_notification_template(
            template,
            build_notification_sample_context(
                current_user=None,
                channel="email",
                recipient=to_email,
                public_base_url=email_branding.get("public_base_url"),
            )
            | {
                "user_name": username,
                "username": username,
                "reset_time": reset_time,
                "action_link": effective_action_link,
                "action_hint": action_hint,
            },
            locale=resolved_locale,
            email_branding=email_branding,
        )
        subject = (
            str(
                rendered["subject"]
                or (
                    "Password reset notice - Enterprise Portal"
                    if resolved_locale == "en-US"
                    else "密码重置通知 - Enterprise Portal"
                )
            ).strip()
            or (
                "Password reset notice - Enterprise Portal"
                if resolved_locale == "en-US"
                else "密码重置通知 - Enterprise Portal"
            )
        )
        text = str(rendered["content"] or "").strip()
        html = str(rendered.get("html_content") or "").strip() or None
    else:
        if resolved_locale == "en-US":
            subject = "Password reset notice - Enterprise Portal"
            text = (
                f"Hello {username}, your password was reset at {reset_time}. "
                f"Sign in via {effective_action_link}. {action_hint}"
            )
            html = build_branded_email_html(
                subject=subject,
                body_html=(
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'Hello <strong>{escape(username)}</strong>,</p>'
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'Your password was reset at <strong>{escape(reset_time)}</strong>.</p>'
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'Sign in via <a href="{escape(effective_action_link)}">{escape(effective_action_link)}</a>.</p>'
                    f'<p style="margin:0;color:#64748b;font-size:14px;line-height:1.75;">{escape(action_hint)}</p>'
                ),
                branding=email_branding,
            )
        else:
            subject = "密码重置通知 - Enterprise Portal"
            text = (
                f"您好 {username}，您的密码已于 {reset_time} 被重置。"
                f"请通过 {effective_action_link} 登录。{action_hint}"
            )
            html = build_branded_email_html(
                subject=subject,
                body_html=(
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'您好 <strong>{escape(username)}</strong>，</p>'
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'您的密码已于 <strong>{escape(reset_time)}</strong> 被重置。</p>'
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'请通过 <a href="{escape(effective_action_link)}">{escape(effective_action_link)}</a> 登录。</p>'
                    f'<p style="margin:0;color:#64748b;font-size:14px;line-height:1.75;">{escape(action_hint)}</p>'
                ),
                branding=email_branding,
            )

    await send_email_message(
        to_email,
        subject,
        db,
        text_body=text,
        html_body=html,
    )
    logger.info("Password reset notice sent to %s for user %s", to_email, username)


async def send_password_reset_email(
    to_email: str,
    username: str,
    db: AsyncSession,
    *,
    reset_link: str,
    expires_at: datetime,
    product_name: str | None = None,
    locale: str | None = None,
) -> None:
    resolved_locale = _resolve_mail_locale(locale)
    email_branding = await get_notification_email_branding(db)
    normalized_product_name = str(product_name or "Next-Gen Enterprise Portal").strip() or "Next-Gen Enterprise Portal"
    expires_at_text = expires_at.astimezone().strftime("%Y-%m-%d %H:%M:%S")
    template = await fetch_notification_template_by_code(
        db,
        code="email_password_reset",
        channel="email",
        enabled_only=True,
    )

    if template is not None:
        rendered = render_notification_template(
            template,
            build_notification_sample_context(
                current_user=None,
                channel="email",
                recipient=to_email,
                public_base_url=email_branding.get("public_base_url"),
            )
            | {
                "user_name": username,
                "username": username,
                "reset_link": reset_link,
                "expires_at": expires_at_text,
                "product_name": normalized_product_name,
            },
            locale=resolved_locale,
            email_branding=email_branding,
        )
        fallback_subject = (
            "Reset your password"
            if resolved_locale == "en-US"
            else "重置您的密码"
        )
        subject = str(rendered["subject"] or fallback_subject).strip() or fallback_subject
        text = str(rendered["content"] or "").strip()
        html = str(rendered.get("html_content") or "").strip() or None
    else:
        if resolved_locale == "en-US":
            subject = "Reset your password"
            text = (
                f"Hello {username}, reset your password for {normalized_product_name} with "
                f"{reset_link} before {expires_at_text}."
            )
            html = build_branded_email_html(
                subject=subject,
                body_html=(
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'Hello <strong>{escape(username)}</strong>,</p>'
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'Use the link below to reset your password for <strong>{escape(normalized_product_name)}</strong>.</p>'
                    f'<p style="margin:0 0 16px;"><a href="{escape(reset_link)}">{escape(reset_link)}</a></p>'
                    f'<p style="margin:0;color:#64748b;font-size:14px;line-height:1.75;">'
                    f'This link expires at {escape(expires_at_text)}.</p>'
                ),
                branding=email_branding,
            )
        else:
            subject = "重置您的密码"
            text = (
                f"您好 {username}，请通过 {reset_link} 重置 {normalized_product_name} 的密码，"
                f"链接有效期至 {expires_at_text}。"
            )
            html = build_branded_email_html(
                subject=subject,
                body_html=(
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'您好 <strong>{escape(username)}</strong>，</p>'
                    f'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.75;">'
                    f'请使用下方链接重置 <strong>{escape(normalized_product_name)}</strong> 的密码。</p>'
                    f'<p style="margin:0 0 16px;"><a href="{escape(reset_link)}">{escape(reset_link)}</a></p>'
                    f'<p style="margin:0;color:#64748b;font-size:14px;line-height:1.75;">'
                    f'该链接有效期至 {escape(expires_at_text)}。</p>'
                ),
                branding=email_branding,
            )

    await send_email_message(
        to_email,
        subject,
        db,
        text_body=text,
        html_body=html,
    )
    logger.info("Password reset email sent to %s for user %s", to_email, username)


async def verify_email_otp(username: str, code: str) -> bool:
    """Verify the OTP code from cache."""
    cache = CacheManager()
    cache_key = f"{EMAIL_OTP_PREFIX}{username}"
    fail_key = f"{EMAIL_OTP_FAIL_PREFIX}{username}"
    fail_count_raw = await cache.get(fail_key)
    if fail_count_raw is not None:
        fail_count_str = fail_count_raw.decode("utf-8") if isinstance(fail_count_raw, bytes) else str(fail_count_raw)
        try:
            fail_count = int(fail_count_str)
        except (TypeError, ValueError):
            fail_count = 0
        if fail_count >= EMAIL_OTP_MAX_VERIFY_ATTEMPTS:
            return False

    stored = await cache.get(cache_key)
    if stored is None:
        return False
    # stored could be bytes from Redis
    stored_str = stored.decode("utf-8") if isinstance(stored, bytes) else str(stored)
    if stored_str == code:
        await cache.delete(cache_key)
        await cache.delete(fail_key)
        return True
    await cache.set(fail_key, str((fail_count if 'fail_count' in locals() else 0) + 1), ttl=EMAIL_OTP_TTL)
    return False
