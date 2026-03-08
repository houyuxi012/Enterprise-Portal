from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet
from sqlalchemy import select
from core.runtime_secrets import get_env

import modules.models as models
from modules.iam.services.system_config_security import (
    SYSTEM_CONFIG_SECRET_PREFIX,
    _normalize_fernet_key,
    decrypt_secret_value,
    encrypt_secret_value,
)

logger = logging.getLogger(__name__)

_LEGACY_FERNET_PREFIX = "gAAAA"


def looks_like_legacy_ai_provider_ciphertext(value: str | None) -> bool:
    return str(value or "").startswith(_LEGACY_FERNET_PREFIX)


def is_ai_provider_api_key_ciphertext(value: str | None) -> bool:
    text = str(value or "")
    return text.startswith(SYSTEM_CONFIG_SECRET_PREFIX) or looks_like_legacy_ai_provider_ciphertext(text)


def resolve_ai_provider_api_key_for_storage(api_key: str | None) -> str:
    text = str(api_key or "")
    if text == "":
        return ""
    return encrypt_secret_value(text)


def _load_legacy_ai_provider_fernets() -> list[Fernet]:
    candidates: list[Fernet] = []
    for key_name in ("MASTER_KEY_PREVIOUS", "MASTER_KEY"):
        raw_key = str(get_env(key_name)).strip()
        if raw_key:
            candidates.append(Fernet(_normalize_fernet_key(raw_key)))
    return candidates


def _decrypt_legacy_ai_provider_ciphertext(value: str) -> str:
    for fernet in _load_legacy_ai_provider_fernets():
        try:
            return fernet.decrypt(value.encode("utf-8")).decode("utf-8")
        except Exception:
            continue
    raise RuntimeError(
        "Legacy AI provider ciphertext requires MASTER_KEY_PREVIOUS to migrate into MASTER_KEY-backed storage."
    )


def decrypt_ai_provider_api_key(api_key: str | None, *, allow_plaintext: bool = False) -> str:
    text = str(api_key or "")
    if text == "":
        return ""
    if text.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
        return decrypt_secret_value(text)
    if looks_like_legacy_ai_provider_ciphertext(text):
        return _decrypt_legacy_ai_provider_ciphertext(text)
    if allow_plaintext:
        return text
    raise RuntimeError(
        "AI provider api_key is stored in plaintext. Re-save the provider after configuring MASTER_KEY."
    )


async def ensure_ai_provider_api_keys_encrypted(db_session) -> int:
    result = await db_session.execute(
        select(models.AIProvider).where(
            models.AIProvider.api_key.is_not(None),
            models.AIProvider.api_key != "",
        )
    )

    changed = 0
    for provider in result.scalars().all():
        raw_value = str(provider.api_key or "")
        if not raw_value or raw_value.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
            continue

        try:
            plain_value = (
                _decrypt_legacy_ai_provider_ciphertext(raw_value)
                if looks_like_legacy_ai_provider_ciphertext(raw_value)
                else raw_value
            )
            provider.api_key = encrypt_secret_value(plain_value)
            changed += 1
        except Exception as exc:
            logger.error(
                "Failed to migrate AI provider id=%s api_key to MASTER_KEY-backed storage: %s",
                getattr(provider, "id", None),
                exc,
            )
    return changed
