from __future__ import annotations

from sqlalchemy import select

import modules.models as models
from modules.iam.services.system_config_security import (
    SYSTEM_CONFIG_SECRET_PREFIX,
    decrypt_secret_value,
    encrypt_secret_value,
    has_stored_secret_value,
    is_masked_placeholder,
)


def has_log_forwarding_secret(secret_token: str | None) -> bool:
    return has_stored_secret_value(secret_token)


def resolve_log_forwarding_secret_for_storage(
    secret_token: str | None,
    *,
    existing_value: str | None = None,
) -> str:
    if secret_token is None:
        return str(existing_value or "")
    if is_masked_placeholder(secret_token):
        return str(existing_value or "")

    text = str(secret_token or "")
    if text == "":
        return ""
    return encrypt_secret_value(text)


def decrypt_log_forwarding_secret(secret_token: str | None) -> str:
    return decrypt_secret_value(secret_token)


async def ensure_log_forwarding_secrets_encrypted(db_session) -> int:
    result = await db_session.execute(
        select(models.LogForwardingConfig).where(
            models.LogForwardingConfig.secret_token.is_not(None),
            models.LogForwardingConfig.secret_token != "",
        )
    )

    changed = 0
    for cfg in result.scalars().all():
        raw_value = str(cfg.secret_token or "")
        if raw_value and not raw_value.startswith(SYSTEM_CONFIG_SECRET_PREFIX):
            cfg.secret_token = encrypt_secret_value(raw_value)
            changed += 1
    return changed
