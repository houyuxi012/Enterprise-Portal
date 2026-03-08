from __future__ import annotations

import base64
import hashlib
import os
from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

from cryptography.fernet import Fernet

import modules.models as models
from modules.admin.services.ai_provider_security import (
    decrypt_ai_provider_api_key,
    ensure_ai_provider_api_keys_encrypted,
    resolve_ai_provider_api_key_for_storage,
)
from modules.iam.services.system_config_security import SYSTEM_CONFIG_SECRET_PREFIX


class _ScalarResult:
    def __init__(self, values):
        if isinstance(values, list):
            self._values = values
        else:
            self._values = [values]

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class _FakeDB:
    def __init__(self, execute_results=None):
        self._execute_results = list(execute_results or [])

    async def execute(self, *_args, **_kwargs):
        if not self._execute_results:
            raise AssertionError("Unexpected DB execute call in test.")
        return self._execute_results.pop(0)


def _encrypt_legacy_ciphertext(secret_key: str, plain_text: str) -> str:
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    fernet = Fernet(base64.urlsafe_b64encode(digest))
    return fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")


class AIProviderSecretHandlingTests(IsolatedAsyncioTestCase):
    def test_storage_uses_master_key_prefix_and_runtime_decrypts(self):
        with patch.dict(os.environ, {"MASTER_KEY": "unit-test-master-key"}, clear=False):
            encrypted = resolve_ai_provider_api_key_for_storage("Provider-Secret-001")

        self.assertNotEqual(encrypted, "Provider-Secret-001")
        self.assertTrue(encrypted.startswith(SYSTEM_CONFIG_SECRET_PREFIX))

        with patch.dict(os.environ, {"MASTER_KEY": "unit-test-master-key"}, clear=False):
            resolved = decrypt_ai_provider_api_key(encrypted)

        self.assertEqual(resolved, "Provider-Secret-001")

    def test_runtime_rejects_persisted_plaintext(self):
        with self.assertRaises(RuntimeError):
            decrypt_ai_provider_api_key("plaintext-provider-secret")

    def test_runtime_allows_plaintext_for_unsaved_provider(self):
        self.assertEqual(
            decrypt_ai_provider_api_key("plaintext-provider-secret", allow_plaintext=True),
            "plaintext-provider-secret",
        )

    async def test_startup_migrates_plaintext_and_legacy_ciphertext(self):
        with patch.dict(os.environ, {"MASTER_KEY": "unit-test-master-key"}, clear=False):
            current_encrypted = resolve_ai_provider_api_key_for_storage("already-encrypted")

        plaintext_provider = models.AIProvider(id=1, name="plain", type="openai", api_key="plain-secret")
        legacy_provider = models.AIProvider(
            id=2,
            name="legacy",
            type="openai",
            api_key=_encrypt_legacy_ciphertext("legacy-secret-key", "legacy-secret"),
        )
        encrypted_provider = models.AIProvider(
            id=3,
            name="current",
            type="openai",
            api_key=current_encrypted,
        )
        db = _FakeDB([
            _ScalarResult([plaintext_provider, legacy_provider, encrypted_provider]),
        ])

        with patch.dict(
            os.environ,
            {
                "MASTER_KEY": "unit-test-master-key",
                "MASTER_KEY_PREVIOUS": "legacy-secret-key",
            },
            clear=False,
        ):
            changed = await ensure_ai_provider_api_keys_encrypted(db)

        self.assertEqual(changed, 2)
        self.assertTrue(str(plaintext_provider.api_key).startswith(SYSTEM_CONFIG_SECRET_PREFIX))
        self.assertTrue(str(legacy_provider.api_key).startswith(SYSTEM_CONFIG_SECRET_PREFIX))
        with patch.dict(
            os.environ,
            {
                "MASTER_KEY": "unit-test-master-key",
                "MASTER_KEY_PREVIOUS": "legacy-secret-key",
            },
            clear=False,
        ):
            self.assertEqual(
                decrypt_ai_provider_api_key(plaintext_provider.api_key),
                "plain-secret",
            )
            self.assertEqual(
                decrypt_ai_provider_api_key(legacy_provider.api_key),
                "legacy-secret",
            )
            self.assertEqual(
                decrypt_ai_provider_api_key(encrypted_provider.api_key),
                "already-encrypted",
            )
