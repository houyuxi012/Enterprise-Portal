from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Dict

from cryptography.fernet import Fernet
from core.runtime_secrets import get_env, get_required_env

logger = logging.getLogger(__name__)

SYSTEM_CONFIG_SECRET_PREFIX = "fernet:v1:"
SYSTEM_CONFIG_MASKED_PLACEHOLDER = "__MASKED__"

SENSITIVE_SYSTEM_CONFIG_KEYS = {
    "smtp_password",
    "telegram_bot_token",
    "sms_access_key_secret",
    "tencent_secret_key",
    "twilio_auth_token",
    "platform_ssl_private_key",
    "platform_snmp_community",
}


def is_sensitive_system_config_key(key: str) -> bool:
    return str(key or "").strip() in SENSITIVE_SYSTEM_CONFIG_KEYS


def is_masked_placeholder(value: str | None) -> bool:
    return str(value or "").strip() == SYSTEM_CONFIG_MASKED_PLACEHOLDER


def _normalize_fernet_key(raw_key: str) -> bytes:
    text = str(raw_key or "").strip()
    if not text:
        raise RuntimeError("MASTER_KEY is required for sensitive system config encryption.")
    try:
        decoded = base64.urlsafe_b64decode(text.encode("utf-8"))
        if len(decoded) == 32:
            return text.encode("utf-8")
    except Exception:
        pass
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _load_fernet_key_candidates() -> list[Fernet]:
    candidates: list[Fernet] = []

    master_key = str(get_env("MASTER_KEY")).strip()
    if master_key:
        candidates.append(Fernet(_normalize_fernet_key(master_key)))

    previous_master_key = str(get_env("MASTER_KEY_PREVIOUS")).strip()
    if previous_master_key:
        candidates.append(Fernet(_normalize_fernet_key(previous_master_key)))

    return candidates


def _get_primary_fernet() -> Fernet:
    return Fernet(_normalize_fernet_key(get_required_env("MASTER_KEY")))


def has_stored_secret_value(value: str | None) -> bool:
    return bool(str(value or "").strip())


def sanitize_secret_value_for_client(value: str | None) -> str:
    return SYSTEM_CONFIG_MASKED_PLACEHOLDER if has_stored_secret_value(value) else ""


def encrypt_secret_value(value: str | None) -> str:
    text = str(value or "")
    if text == "":
        return ""
    if text.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
        return text
    token = _get_primary_fernet().encrypt(text.encode("utf-8")).decode("utf-8")
    return f"{SYSTEM_CONFIG_SECRET_PREFIX}{token}"


def decrypt_secret_value(value: str | None) -> str:
    text = str(value or "")
    if text == "":
        return ""
    if not text.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
        # Legacy plaintext value; keep readable and allow gradual migration.
        return text

    token = text[len(SYSTEM_CONFIG_SECRET_PREFIX) :]
    for fernet in _load_fernet_key_candidates():
        try:
            return fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except Exception:
            continue
    raise RuntimeError("Failed to decrypt sensitive secret value. Check MASTER_KEY rotation settings.")


def encrypt_sensitive_system_config_value(key: str, value: str | None) -> str:
    text = str(value or "")
    if not is_sensitive_system_config_key(key):
        return text
    return encrypt_secret_value(text)


def decrypt_sensitive_system_config_value(key: str, value: str | None) -> str:
    text = str(value or "")
    if not is_sensitive_system_config_key(key):
        return text
    try:
        return decrypt_secret_value(text)
    except RuntimeError as exc:
        raise RuntimeError(f"Failed to decrypt sensitive config key '{key}'. Check MASTER_KEY rotation settings.") from exc


def decrypt_system_config_map(config_map: Dict[str, str]) -> Dict[str, str]:
    resolved: Dict[str, str] = {}
    for key, value in (config_map or {}).items():
        if is_sensitive_system_config_key(key):
            try:
                resolved[key] = decrypt_sensitive_system_config_value(key, value)
            except Exception as exc:
                logger.error("Sensitive config decrypt failed for key=%s: %s", key, exc)
                resolved[key] = ""
        else:
            resolved[key] = str(value or "")
    return resolved


def sanitize_system_config_map_for_client(config_map: Dict[str, str]) -> Dict[str, str]:
    sanitized: Dict[str, str] = {}
    for key, value in (config_map or {}).items():
        if is_sensitive_system_config_key(key):
            sanitized[key] = sanitize_secret_value_for_client(value)
        else:
            sanitized[key] = str(value or "")
    return sanitized


async def ensure_sensitive_system_config_encrypted(db_session) -> int:
    """
    Encrypt legacy plaintext secrets in system_config table.
    Returns number of rows migrated.
    """
    from sqlalchemy import select
    import modules.models as models

    result = await db_session.execute(
        select(models.SystemConfig).where(models.SystemConfig.key.in_(list(SENSITIVE_SYSTEM_CONFIG_KEYS)))
    )
    changed = 0
    for cfg in result.scalars().all():
        raw_value = str(cfg.value or "")
        if raw_value and not raw_value.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
            cfg.value = encrypt_sensitive_system_config_value(cfg.key, raw_value)
            changed += 1
    return changed
