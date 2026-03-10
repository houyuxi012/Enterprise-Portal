from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from html import escape, unescape
from typing import Any, Iterable, Literal, Mapping
from urllib.parse import urljoin, urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
from modules.iam.services.system_config_security import decrypt_system_config_map

NotificationTemplateChannel = Literal["email", "sms", "im"]
NotificationTemplateLocale = Literal["zh-CN", "en-US"]

SUPPORTED_NOTIFICATION_TEMPLATE_LOCALES: tuple[NotificationTemplateLocale, ...] = ("zh-CN", "en-US")

_PLACEHOLDER_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")
_VARIABLE_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$")
_HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_HTML_BREAK_TAG_RE = re.compile(r"(?i)<br\s*/?>")
_HTML_BLOCK_END_TAG_RE = re.compile(r"(?i)</(p|div|section|article|header|footer|li|ul|ol|table|tr|td|th|h[1-6])>")
_HTML_STRIP_TAG_RE = re.compile(r"(?is)<[^>]+>")
_HTML_DANGEROUS_BLOCK_RE = re.compile(
    r"(?is)<(script|iframe|object|embed|form|meta|link|base|svg|style)\b[^>]*>.*?</\1\s*>"
)
_HTML_DANGEROUS_SELF_CLOSING_RE = re.compile(r"(?is)<(meta|link|base)\b[^>]*?/?>")
_HTML_EVENT_HANDLER_ATTR_RE = re.compile(r"""(?is)\s+on[a-z0-9_-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)""")
_HTML_JS_PROTOCOL_RE = re.compile(r"""(?is)(href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*\2""")
_HTML_DATA_PROTOCOL_RE = re.compile(r"""(?is)(href|src)\s*=\s*(['"]?)\s*data:text/html[^'">\s]*\2""")
_TEMPLATE_CONFIG_KEY_BY_CHANNEL: dict[NotificationTemplateChannel, str] = {
    "email": "notification_email_template_id",
    "sms": "notification_sms_template_id",
    "im": "notification_im_template_id",
}
_EMAIL_BRANDING_CONFIG_KEYS: tuple[str, ...] = (
    "app_name",
    "browser_title",
    "logo_url",
    "footer_text",
    "platform_public_base_url",
    "platform_domain",
)


def _normalize_string(value: object) -> str:
    return str(value or "").strip()


def _contains_html_markup(value: str | None) -> bool:
    return bool(_HTML_TAG_RE.search(str(value or "")))


def _sanitize_email_html(raw_html: str | None) -> str:
    sanitized = str(raw_html or "")
    sanitized = _HTML_DANGEROUS_BLOCK_RE.sub("", sanitized)
    sanitized = _HTML_DANGEROUS_SELF_CLOSING_RE.sub("", sanitized)
    sanitized = _HTML_EVENT_HANDLER_ATTR_RE.sub("", sanitized)
    sanitized = _HTML_JS_PROTOCOL_RE.sub(r'\1="#"', sanitized)
    sanitized = _HTML_DATA_PROTOCOL_RE.sub(r'\1="#"', sanitized)
    return sanitized.strip()


def _convert_plain_text_to_html(text: str | None) -> str:
    raw_text = str(text or "").strip()
    if not raw_text:
        return ""
    paragraphs = [segment.strip() for segment in re.split(r"(?:\r?\n){2,}", raw_text) if segment.strip()]
    return "".join(
        f'<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.75;">'
        f'{escape(paragraph).replace(chr(10), "<br />")}'
        "</p>"
        for paragraph in paragraphs
    )


def _convert_html_to_text(raw_html: str | None) -> str:
    html = str(raw_html or "")
    if not html:
        return ""
    html = _HTML_BREAK_TAG_RE.sub("\n", html)
    html = _HTML_BLOCK_END_TAG_RE.sub("\n", html)
    html = _HTML_STRIP_TAG_RE.sub("", html)
    html = unescape(html)
    lines = [line.strip() for line in html.splitlines()]
    compacted = "\n".join(line for line in lines if line)
    return compacted.strip()


def _resolve_email_public_base_url(config_map: Mapping[str, object] | None = None) -> str:
    candidates = [
        os.getenv("PORTAL_PUBLIC_BASE_URL", "").strip(),
        os.getenv("PUBLIC_BASE_URL", "").strip(),
        _normalize_string((config_map or {}).get("platform_public_base_url")),
    ]
    for candidate in candidates:
        if candidate:
            return candidate.rstrip("/")
    domain = _normalize_string((config_map or {}).get("platform_domain"))
    if domain:
        return f"https://{domain}".rstrip("/")
    return ""


def _resolve_email_logo_url(raw_logo_url: str | None, public_base_url: str) -> str:
    logo_url = _normalize_string(raw_logo_url)
    if not logo_url:
        return ""
    if logo_url.startswith("/api/v1/files/"):
        logo_url = f"/api/v1/public/files/{logo_url[len('/api/v1/files/'):]}"
    parsed = urlparse(logo_url)
    if parsed.scheme and parsed.netloc:
        return logo_url
    if public_base_url:
        return urljoin(f"{public_base_url}/", logo_url.lstrip("/"))
    return logo_url


async def get_notification_email_branding(
    db: AsyncSession,
    *,
    config_map: Mapping[str, object] | None = None,
) -> dict[str, str]:
    effective_config_map = dict(config_map or {})
    if not effective_config_map:
        effective_config_map = await get_system_config_map(db, keys=_EMAIL_BRANDING_CONFIG_KEYS)
    public_base_url = _resolve_email_public_base_url(effective_config_map)
    app_name = (
        _normalize_string(effective_config_map.get("app_name"))
        or _normalize_string(effective_config_map.get("browser_title"))
        or "Next-Gen Enterprise Portal"
    )
    footer_text = _normalize_string(effective_config_map.get("footer_text")) or app_name
    logo_url = _resolve_email_logo_url(_normalize_string(effective_config_map.get("logo_url")), public_base_url)
    return {
        "app_name": app_name,
        "footer_text": footer_text,
        "logo_url": logo_url,
        "public_base_url": public_base_url,
    }


def build_branded_email_html(
    *,
    subject: str,
    body_html: str,
    branding: Mapping[str, object] | None = None,
) -> str:
    brand_name = _normalize_string((branding or {}).get("app_name")) or "Next-Gen Enterprise Portal"
    footer_text = _normalize_string((branding or {}).get("footer_text")) or brand_name
    logo_url = _normalize_string((branding or {}).get("logo_url"))
    public_base_url = _normalize_string((branding or {}).get("public_base_url"))
    brand_link = public_base_url or "#"
    safe_subject = escape(subject or brand_name)
    logo_markup = (
        f'<img src="{escape(logo_url)}" alt="{escape(brand_name)}" '
        'style="display:block;width:40px;height:40px;border-radius:12px;object-fit:contain;background:#ffffff;" />'
        if logo_url
        else ""
    )
    safe_brand_markup = (
        f'<a href="{escape(brand_link)}" style="display:inline-flex;align-items:center;gap:12px;'
        'text-decoration:none;color:#0f172a;">'
        f"{logo_markup}"
        f'<span style="font-size:22px;font-weight:700;letter-spacing:-0.02em;">{escape(brand_name)}</span>'
        "</a>"
        if logo_markup and brand_link != "#"
        else (
            f'<div style="display:inline-flex;align-items:center;gap:12px;">{logo_markup}'
            f'<span style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">{escape(brand_name)}</span>'
            "</div>"
            if logo_markup
            else f'<div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">{escape(brand_name)}</div>'
        )
    )
    return (
        "<!doctype html>"
        "<html><body style=\"margin:0;padding:32px;background:#f8fafc;"
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;\">"
        "<div style=\"max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;"
        "border-radius:24px;overflow:hidden;box-shadow:0 24px 64px rgba(15,23,42,0.08);\">"
        f"<div style=\"padding:32px 36px 12px;\">{safe_brand_markup}</div>"
        f"<div style=\"padding:8px 36px 36px;\">"
        f"<h1 style=\"margin:0 0 16px;color:#0f172a;font-size:36px;line-height:1.15;font-weight:800;\">{safe_subject}</h1>"
        "<div style=\"height:1px;background:#e2e8f0;margin:0 0 24px;\"></div>"
        f"<div>{body_html}</div>"
        "<div style=\"height:1px;background:#e2e8f0;margin:28px 0 18px;\"></div>"
        f"<p style=\"margin:0;color:#64748b;font-size:13px;line-height:1.7;\">{escape(footer_text)}</p>"
        "</div></div></body></html>"
    )


def normalize_notification_template_locale(locale: object | None) -> NotificationTemplateLocale | None:
    raw = _normalize_string(locale)
    if not raw:
        return None
    language_tag = raw.split(",")[0].replace("_", "-").strip().lower()
    if language_tag.startswith("zh"):
        return "zh-CN"
    if language_tag.startswith("en"):
        return "en-US"
    return None


def normalize_notification_template_i18n_map(raw_map: Mapping[str, object] | None) -> dict[str, str]:
    if not isinstance(raw_map, Mapping):
        return {}
    normalized: dict[str, str] = {}
    for locale, value in raw_map.items():
        normalized_locale = normalize_notification_template_locale(locale)
        normalized_value = _normalize_string(value)
        if normalized_locale is None or not normalized_value:
            continue
        normalized[normalized_locale] = normalized_value
    return normalized


def get_localized_notification_template_text(
    default_text: object | None,
    i18n_map: Mapping[str, object] | None,
    *,
    locale: object | None = None,
    default_locale: object | None = None,
) -> str:
    normalized_default = _normalize_string(default_text)
    normalized_i18n = normalize_notification_template_i18n_map(i18n_map)
    effective_locale = (
        normalize_notification_template_locale(locale)
        or normalize_notification_template_locale(default_locale)
    )
    if effective_locale and normalized_i18n.get(effective_locale):
        return normalized_i18n[effective_locale]
    return normalized_default


def get_localized_notification_template_name(
    template: models.NotificationTemplate,
    *,
    locale: object | None = None,
) -> str:
    return get_localized_notification_template_text(
        getattr(template, "name", ""),
        getattr(template, "name_i18n", {}),
        locale=locale,
        default_locale=getattr(template, "default_locale", None),
    )


def _deduplicate_names(values: Iterable[str]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for raw in values:
        name = _normalize_string(raw)
        if not name:
            continue
        lowered = name.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        names.append(name)
    return names


async def get_system_config_map(db: AsyncSession, keys: Iterable[str] | None = None) -> dict[str, str]:
    query = select(models.SystemConfig)
    requested_keys = [key for key in (keys or []) if _normalize_string(key)]
    if requested_keys:
        query = query.where(models.SystemConfig.key.in_(requested_keys))
    result = await db.execute(query)
    return decrypt_system_config_map({cfg.key: cfg.value for cfg in result.scalars().all()})


def resolve_notification_template_id_from_config_map(
    config_map: Mapping[str, object],
    channel: NotificationTemplateChannel,
) -> int | None:
    raw_value = _normalize_string(config_map.get(_TEMPLATE_CONFIG_KEY_BY_CHANNEL[channel]))
    if not raw_value:
        return None
    try:
        template_id = int(raw_value)
    except (TypeError, ValueError):
        return None
    return template_id if template_id > 0 else None


async def fetch_notification_template(
    db: AsyncSession,
    *,
    template_id: int,
    channel: NotificationTemplateChannel,
    enabled_only: bool = True,
) -> models.NotificationTemplate | None:
    query = select(models.NotificationTemplate).where(
        models.NotificationTemplate.id == template_id,
        models.NotificationTemplate.category == channel,
    )
    if enabled_only:
        query = query.where(models.NotificationTemplate.is_enabled.is_(True))
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def fetch_notification_template_by_code(
    db: AsyncSession,
    *,
    code: str,
    channel: NotificationTemplateChannel,
    enabled_only: bool = True,
) -> models.NotificationTemplate | None:
    normalized_code = _normalize_string(code)
    if not normalized_code:
        return None
    query = select(models.NotificationTemplate).where(
        models.NotificationTemplate.code == normalized_code,
        models.NotificationTemplate.category == channel,
    )
    if enabled_only:
        query = query.where(models.NotificationTemplate.is_enabled.is_(True))
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def resolve_notification_template(
    db: AsyncSession,
    *,
    channel: NotificationTemplateChannel,
    template_id: int | None = None,
    config_map: Mapping[str, object] | None = None,
    enabled_only: bool = True,
) -> models.NotificationTemplate | None:
    effective_template_id = template_id
    if effective_template_id is None:
        effective_template_id = resolve_notification_template_id_from_config_map(config_map or {}, channel)
    if effective_template_id is None:
        return None
    return await fetch_notification_template(
        db,
        template_id=effective_template_id,
        channel=channel,
        enabled_only=enabled_only,
    )


def extract_notification_template_variables(template: models.NotificationTemplate) -> list[str]:
    names = list(template.variables or [])
    subject_i18n = normalize_notification_template_i18n_map(getattr(template, "subject_i18n", {}))
    content_i18n = normalize_notification_template_i18n_map(getattr(template, "content_i18n", {}))
    for text in (
        getattr(template, "subject", "") or "",
        *subject_i18n.values(),
        getattr(template, "content", "") or "",
        *content_i18n.values(),
    ):
        names.extend(match.group(1) for match in _PLACEHOLDER_RE.finditer(text))
    return _deduplicate_names(names)


def extract_placeholder_names(*template_parts: str | None) -> list[str]:
    names: list[str] = []
    for text in template_parts:
        names.extend(match.group(1) for match in _PLACEHOLDER_RE.finditer(str(text or "")))
    return _deduplicate_names(names)


def analyze_notification_template_definition(
    *,
    category: NotificationTemplateChannel,
    subject: str | None,
    content: str | None,
    declared_variables: Iterable[str] | None,
    subject_i18n: Mapping[str, object] | None = None,
    content_i18n: Mapping[str, object] | None = None,
) -> dict[str, list[str]]:
    normalized_declared = _deduplicate_names(declared_variables or [])
    normalized_subject_i18n = normalize_notification_template_i18n_map(subject_i18n)
    normalized_content_i18n = normalize_notification_template_i18n_map(content_i18n)
    subject_parts: list[str | None] = [subject] if category == "email" else []
    placeholder_names = extract_placeholder_names(
        *subject_parts,
        *([text for text in normalized_subject_i18n.values()] if category == "email" else []),
        content,
        *normalized_content_i18n.values(),
    )
    normalized_declared_keys = {name.lower(): name for name in normalized_declared}
    placeholder_keys = {name.lower(): name for name in placeholder_names}

    invalid_declared = [name for name in normalized_declared if not _VARIABLE_NAME_RE.match(name)]
    missing_declared = [
        placeholder_keys[key]
        for key in placeholder_keys
        if key not in normalized_declared_keys
    ]
    unused_declared = [
        normalized_declared_keys[key]
        for key in normalized_declared_keys
        if key not in placeholder_keys
    ]

    return {
        "declared_variables": normalized_declared,
        "placeholder_variables": placeholder_names,
        "invalid_declared_variables": invalid_declared,
        "missing_declared_variables": missing_declared,
        "unused_declared_variables": unused_declared,
    }


def build_notification_sample_context(
    *,
    current_user: models.User | None = None,
    channel: NotificationTemplateChannel,
    recipient: str | None = None,
    public_base_url: str | None = None,
) -> dict[str, str]:
    now = datetime.now().astimezone()
    actor_name = _normalize_string(getattr(current_user, "name", None))
    actor_username = _normalize_string(getattr(current_user, "username", None))
    actor_label = actor_name or actor_username or "admin"
    recipient_value = _normalize_string(recipient)
    resolved_public_base_url = _normalize_string(public_base_url).rstrip("/")
    default_action_link = resolved_public_base_url or "https://portal.example.com"
    default_reset_link = urljoin(f"{default_action_link}/", "reset-password")
    default_log_link = urljoin(f"{default_action_link}/", "admin/logs")

    return {
        "user_name": actor_label,
        "username": actor_username or actor_label,
        "code": "123456",
        "expires_in_minutes": "5",
        "expires_at": (now + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M"),
        "reset_link": default_reset_link,
        "product_name": "Next-Gen Enterprise Portal",
        "severity": "HIGH",
        "module": "Notification Service",
        "summary": "Template render verification",
        "details": "This message is rendered from the selected notification template.",
        "occurred_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "business_name": "Notification Service",
        "deadline": (now + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M"),
        "action_hint": "Please review the latest status in the portal.",
        "priority": "high",
        "environment": "production",
        "owner": actor_label,
        "action_link": default_action_link,
        "requester": actor_label,
        "approval_name": "Template Preview Approval",
        "job_name": "notification-template-test",
        "failure_reason": "Template render verification",
        "retry_count": "1",
        "log_link": default_log_link,
        "channel": channel,
        "reset_time": now.strftime("%Y-%m-%d %H:%M:%S"),
        "recipient_email": recipient_value or "admin@example.com",
        "recipient_phone": recipient_value or "+8613812345678",
        "recipient_chat_id": recipient_value or "123456789",
    }


def _fallback_sample_value(name: str, context: Mapping[str, object]) -> str:
    key = name.lower()
    if key in context:
        return _normalize_string(context[key])
    if key.endswith("_link") or key.endswith("_url"):
        return "https://portal.example.com"
    if key.endswith("_at") or key.endswith("_time"):
        return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
    if "email" in key:
        return _normalize_string(context.get("recipient_email")) or "admin@example.com"
    if "phone" in key or "mobile" in key:
        return _normalize_string(context.get("recipient_phone")) or "+8613812345678"
    if "chat" in key:
        return _normalize_string(context.get("recipient_chat_id")) or "123456789"
    if "count" in key or "minutes" in key:
        return "1"
    return f"sample_{key}"


def render_notification_text(template_text: str | None, context: Mapping[str, object]) -> str:
    if not template_text:
        return ""

    def _replace(match: re.Match[str]) -> str:
        variable_name = match.group(1)
        return _fallback_sample_value(variable_name, context)

    return _PLACEHOLDER_RE.sub(_replace, template_text)


def render_notification_template(
    template: models.NotificationTemplate,
    context: Mapping[str, object],
    *,
    locale: object | None = None,
    email_branding: Mapping[str, object] | None = None,
) -> dict[str, Any]:
    subject = get_localized_notification_template_text(
        getattr(template, "subject", "") or "",
        getattr(template, "subject_i18n", {}),
        locale=locale,
        default_locale=getattr(template, "default_locale", None),
    )
    content = get_localized_notification_template_text(
        getattr(template, "content", ""),
        getattr(template, "content_i18n", {}),
        locale=locale,
        default_locale=getattr(template, "default_locale", None),
    )
    rendered_content = render_notification_text(content, context)
    html_content = None
    text_content = rendered_content
    if getattr(template, "category", None) == "email":
        content_html = (
            _sanitize_email_html(rendered_content)
            if _contains_html_markup(rendered_content)
            else _convert_plain_text_to_html(rendered_content)
        )
        html_content = build_branded_email_html(
            subject=render_notification_text(subject, context),
            body_html=content_html,
            branding=email_branding,
        )
        text_content = _convert_html_to_text(content_html) or rendered_content
    return {
        "subject": render_notification_text(subject, context),
        "content": text_content,
        "html_content": html_content,
        "rendered_content": rendered_content,
        "variables": {
            name: _fallback_sample_value(name, context)
            for name in extract_notification_template_variables(template)
        },
    }


def build_sms_test_payload(
    template: models.NotificationTemplate,
    context: Mapping[str, object],
) -> dict[str, str]:
    rendered = render_notification_template(template, context)
    variables = rendered["variables"]
    ordered_values = [str(variables[name]) for name in extract_notification_template_variables(template)]
    return {
        "twilio_message": rendered["content"],
        "aliyun_template_param": json.dumps(variables, ensure_ascii=False),
        "tencent_template_params": ",".join(value.replace(",", " ") for value in ordered_values),
    }
