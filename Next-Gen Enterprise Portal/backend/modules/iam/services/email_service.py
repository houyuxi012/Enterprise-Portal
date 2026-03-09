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
from typing import Optional

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
from infrastructure.cache_manager import CacheManager
from modules.admin.services.notification_templates import (
    build_notification_sample_context,
    fetch_notification_template_by_code,
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
        "port": int(all_cfg.get("smtp_port", "587")),
        "username": all_cfg.get("smtp_username", ""),
        "password": all_cfg.get("smtp_password", ""),
        "use_tls": str(all_cfg.get("smtp_use_tls", "true")).lower() == "true",
        "sender": all_cfg.get("smtp_sender", all_cfg.get("smtp_username", "")),
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
        await aiosmtplib.send(
            msg,
            hostname=cfg["host"],
            port=cfg["port"],
            username=cfg["username"],
            password=cfg["password"],
            start_tls=cfg["use_tls"],
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
            )
            | {
                "user_name": username,
                "username": username,
                "code": code,
                "expires_in_minutes": str(EMAIL_OTP_TTL // 60),
            },
            locale=resolved_locale,
        )
        fallback_subject = (
            "Email verification code - Enterprise Portal"
            if resolved_locale == "en-US"
            else "登录验证码 - Enterprise Portal"
        )
        subject = str(rendered["subject"] or fallback_subject).strip() or fallback_subject
        text = str(rendered["content"] or "").strip()
        html = None
    else:
        if resolved_locale == "en-US":
            subject = "Email verification code - Enterprise Portal"
            html = f"""
        <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:28px 24px;text-align:center;">
            <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Email Verification Code</h2>
          </div>
          <div style="padding:32px 24px;text-align:center;">
            <p style="margin:0 0 8px;color:#64748b;font-size:14px;">Hello, <strong style="color:#1e293b">{username}</strong></p>
            <p style="margin:0 0 24px;color:#64748b;font-size:14px;">Your email verification code is:</p>
            <div style="display:inline-block;padding:16px 48px;background:#f1f5f9;border-radius:12px;letter-spacing:0.5em;font-size:36px;font-weight:800;color:#1e293b;">
              {code}
            </div>
            <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">The code is valid for {EMAIL_OTP_TTL // 60} minutes. Do not share it.</p>
          </div>
        </div>
        """
            text = f"Hello {username}, your email verification code is {code}. It is valid for {EMAIL_OTP_TTL // 60} minutes."
        else:
            subject = "登录验证码 - Enterprise Portal"
            html = f"""
        <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:28px 24px;text-align:center;">
            <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">登录验证码</h2>
          </div>
          <div style="padding:32px 24px;text-align:center;">
            <p style="margin:0 0 8px;color:#64748b;font-size:14px;">您好，<strong style="color:#1e293b">{username}</strong></p>
            <p style="margin:0 0 24px;color:#64748b;font-size:14px;">您的邮箱验证码为：</p>
            <div style="display:inline-block;padding:16px 48px;background:#f1f5f9;border-radius:12px;letter-spacing:0.5em;font-size:36px;font-weight:800;color:#1e293b;">
              {code}
            </div>
            <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">验证码 {EMAIL_OTP_TTL // 60} 分钟内有效，请勿泄露给他人。</p>
          </div>
        </div>
        """
            text = f"{username}，您好。您的邮箱验证码是 {code}，{EMAIL_OTP_TTL // 60} 分钟内有效。"
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
    template = await fetch_notification_template_by_code(
        db,
        code="email_password_reset_notice",
        channel="email",
        enabled_only=True,
    )
    effective_action_link = str(action_link or DEFAULT_PORTAL_LOGIN_URL).strip() or DEFAULT_PORTAL_LOGIN_URL
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
            )
            | {
                "user_name": username,
                "username": username,
                "reset_time": reset_time,
                "action_link": effective_action_link,
                "action_hint": action_hint,
            },
            locale=resolved_locale,
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
        html = None
    else:
        if resolved_locale == "en-US":
            subject = "Password reset notice - Enterprise Portal"
            text = (
                f"Hello {username}, your password was reset at {reset_time}. "
                f"Sign in via {effective_action_link}. {action_hint}"
            )
            html = f"""
        <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 24px;text-align:center;">
            <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Password Reset Notice</h2>
          </div>
          <div style="padding:32px 24px;color:#1e293b;line-height:1.7;">
            <p style="margin:0 0 12px;">Hello <strong>{escape(username)}</strong>,</p>
            <p style="margin:0 0 12px;">Your password was reset at <strong>{escape(reset_time)}</strong>.</p>
            <p style="margin:0 0 12px;">Sign in via <a href="{escape(effective_action_link)}">{escape(effective_action_link)}</a>.</p>
            <p style="margin:0;color:#475569;">{escape(action_hint)}</p>
          </div>
        </div>
        """
        else:
            subject = "密码重置通知 - Enterprise Portal"
            text = (
                f"您好 {username}，您的密码已于 {reset_time} 被重置。"
                f"请通过 {effective_action_link} 登录。{action_hint}"
            )
            html = f"""
        <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 24px;text-align:center;">
            <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">密码重置通知</h2>
          </div>
          <div style="padding:32px 24px;color:#1e293b;line-height:1.7;">
            <p style="margin:0 0 12px;">您好 <strong>{escape(username)}</strong>，</p>
            <p style="margin:0 0 12px;">您的密码已于 <strong>{escape(reset_time)}</strong> 被重置。</p>
            <p style="margin:0 0 12px;">请通过 <a href="{escape(effective_action_link)}">{escape(effective_action_link)}</a> 登录。</p>
            <p style="margin:0;color:#475569;">{escape(action_hint)}</p>
          </div>
        </div>
        """

    await send_email_message(
        to_email,
        subject,
        db,
        text_body=text,
        html_body=html,
    )
    logger.info("Password reset notice sent to %s for user %s", to_email, username)


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
