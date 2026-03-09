from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any, Iterable, Literal, Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
from modules.iam.services.system_config_security import decrypt_system_config_map

NotificationTemplateChannel = Literal["email", "sms", "im"]
NotificationTemplateLocale = Literal["zh-CN", "en-US"]

SUPPORTED_NOTIFICATION_TEMPLATE_LOCALES: tuple[NotificationTemplateLocale, ...] = ("zh-CN", "en-US")

_PLACEHOLDER_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")
_VARIABLE_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$")
_TEMPLATE_CONFIG_KEY_BY_CHANNEL: dict[NotificationTemplateChannel, str] = {
    "email": "notification_email_template_id",
    "sms": "notification_sms_template_id",
    "im": "notification_im_template_id",
}


def _normalize_string(value: object) -> str:
    return str(value or "").strip()


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
) -> str:
    normalized_default = _normalize_string(default_text)
    normalized_i18n = normalize_notification_template_i18n_map(i18n_map)
    normalized_locale = normalize_notification_template_locale(locale)
    if normalized_locale and normalized_i18n.get(normalized_locale):
        return normalized_i18n[normalized_locale]
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
) -> dict[str, str]:
    now = datetime.now().astimezone()
    actor_name = _normalize_string(getattr(current_user, "name", None))
    actor_username = _normalize_string(getattr(current_user, "username", None))
    actor_label = actor_name or actor_username or "admin"
    recipient_value = _normalize_string(recipient)
    default_action_link = "https://portal.example.com/admin"

    return {
        "user_name": actor_label,
        "username": actor_username or actor_label,
        "code": "123456",
        "expires_in_minutes": "5",
        "expires_at": (now + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M"),
        "reset_link": "https://portal.example.com/reset-password",
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
        "log_link": "https://portal.example.com/admin/logs",
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
) -> dict[str, Any]:
    subject = get_localized_notification_template_text(
        getattr(template, "subject", "") or "",
        getattr(template, "subject_i18n", {}),
        locale=locale,
    )
    content = get_localized_notification_template_text(
        getattr(template, "content", ""),
        getattr(template, "content_i18n", {}),
        locale=locale,
    )
    return {
        "subject": render_notification_text(subject, context),
        "content": render_notification_text(content, context),
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
