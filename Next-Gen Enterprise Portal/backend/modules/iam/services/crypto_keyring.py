import base64
import json
import os
from functools import lru_cache
from typing import Dict, Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _b64url_nopad_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_nopad_decode(value: str) -> bytes:
    text = str(value or "").strip()
    padded = text + ("=" * (-len(text) % 4))
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


class KeyringConfigError(ValueError):
    """Raised when bind password keyring config is invalid or missing."""

    def __init__(self, message: str, *, code: str = "BIND_PASSWORD_KEYRING_INVALID"):
        super().__init__(message)
        self.code = code


class BindPasswordKeyring:
    CIPHERTEXT_PREFIX = "enc"
    CIPHERTEXT_VERSION = "v1"
    KEYRING_ENV = "BIND_PASSWORD_ENC_KEYS"
    ACTIVE_KID_ENV = "BIND_PASSWORD_ENC_ACTIVE_KID"
    CODE_KEYRING_MISSING = "BIND_PASSWORD_KEYRING_MISSING"
    CODE_UNKNOWN_KID = "BIND_PASSWORD_UNKNOWN_KID"
    CODE_DECRYPT_FAILED = "BIND_PASSWORD_DECRYPT_FAILED"

    @classmethod
    @lru_cache(maxsize=1)
    def load_keyring(cls) -> Tuple[Dict[str, bytes], str]:
        raw_keyring = (os.getenv(cls.KEYRING_ENV) or "").strip()
        raw_active_kid = (os.getenv(cls.ACTIVE_KID_ENV) or "").strip()

        if not raw_keyring or not raw_active_kid:
            raise KeyringConfigError(
                f"{cls.KEYRING_ENV}/{cls.ACTIVE_KID_ENV} is not configured",
                code=cls.CODE_KEYRING_MISSING,
            )

        try:
            parsed = json.loads(raw_keyring)
        except json.JSONDecodeError as exc:
            raise KeyringConfigError(f"{cls.KEYRING_ENV} must be valid JSON: {exc}") from exc
        if not isinstance(parsed, dict) or not parsed:
            raise KeyringConfigError(f"{cls.KEYRING_ENV} must be a non-empty object")

        keyring: Dict[str, bytes] = {}
        for kid, value in parsed.items():
            kid_text = str(kid or "").strip()
            if not kid_text:
                raise KeyringConfigError("Key ID (kid) in keyring cannot be empty")
            try:
                key_bytes = _b64url_nopad_decode(str(value or "").strip())
            except Exception as exc:
                raise KeyringConfigError(f"Key '{kid_text}' is not valid base64/base64url") from exc
            if len(key_bytes) != 32:
                raise KeyringConfigError(
                    f"Key '{kid_text}' must decode to exactly 32 bytes (got {len(key_bytes)})"
                )
            keyring[kid_text] = key_bytes

        if raw_active_kid not in keyring:
            raise KeyringConfigError(
                f"Active kid '{raw_active_kid}' not found in {cls.KEYRING_ENV}"
            )
        return keyring, raw_active_kid

    @classmethod
    def clear_cache(cls) -> None:
        cls.load_keyring.cache_clear()

    @classmethod
    def encrypt_bind_password(cls, plaintext: str, aad: bytes) -> str:
        text = str(plaintext or "")
        if text == "":
            return ""
        if not isinstance(aad, (bytes, bytearray)):
            raise KeyringConfigError("AAD must be bytes")

        keyring, active_kid = cls.load_keyring()
        nonce = os.urandom(12)
        cipher = AESGCM(keyring[active_kid]).encrypt(nonce, text.encode("utf-8"), bytes(aad))
        return (
            f"{cls.CIPHERTEXT_PREFIX}:{cls.CIPHERTEXT_VERSION}:{active_kid}:"
            f"{_b64url_nopad_encode(nonce)}:{_b64url_nopad_encode(cipher)}"
        )

    @classmethod
    def decrypt_bind_password(cls, ciphertext: str, aad: bytes) -> str:
        value = str(ciphertext or "").strip()
        if value == "":
            return ""
        if not isinstance(aad, (bytes, bytearray)):
            raise KeyringConfigError("AAD must be bytes")

        parts = value.split(":")
        if len(parts) != 5 or parts[0] != cls.CIPHERTEXT_PREFIX or parts[1] != cls.CIPHERTEXT_VERSION:
            raise KeyringConfigError("Unsupported bind password ciphertext format")
        kid = parts[2]

        keyring, _ = cls.load_keyring()
        if kid not in keyring:
            raise KeyringConfigError(
                f"Unknown bind password kid '{kid}'",
                code=cls.CODE_UNKNOWN_KID,
            )
        try:
            nonce = _b64url_nopad_decode(parts[3])
            cipher = _b64url_nopad_decode(parts[4])
            plain = AESGCM(keyring[kid]).decrypt(nonce, cipher, bytes(aad))
        except KeyringConfigError:
            raise
        except Exception as exc:
            raise KeyringConfigError(
                f"Bind password decrypt failed: {exc}",
                code=cls.CODE_DECRYPT_FAILED,
            ) from exc
        return plain.decode("utf-8")

    @classmethod
    def parse_ciphertext_kid(cls, ciphertext: str) -> Optional[str]:
        value = str(ciphertext or "").strip()
        if not value:
            return None
        parts = value.split(":")
        if len(parts) == 5 and parts[0] == cls.CIPHERTEXT_PREFIX and parts[1] == cls.CIPHERTEXT_VERSION:
            return parts[2]
        return None
