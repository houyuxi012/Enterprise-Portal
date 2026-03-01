import base64
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CryptoKMS:
    """Small AES-GCM helper for sensitive config encryption."""

    KEY_ENV = "BIND_PASSWORD_ENC_KEY"
    KEY_VERSION = "v1"

    @classmethod
    @lru_cache(maxsize=1)
    def _load_key(cls) -> bytes:
        raw = (os.getenv(cls.KEY_ENV) or "").strip()
        if not raw:
            raise ValueError(f"{cls.KEY_ENV} is not configured")

        candidates: list[bytes] = []

        # base64 / base64url
        for decoder in (base64.urlsafe_b64decode, base64.b64decode):
            try:
                padded = raw + ("=" * (-len(raw) % 4))
                value = decoder(padded.encode("utf-8"))
                if value:
                    candidates.append(value)
            except Exception:
                continue

        # hex
        try:
            hex_bytes = bytes.fromhex(raw)
            if hex_bytes:
                candidates.append(hex_bytes)
        except Exception:
            pass

        for key in candidates:
            if len(key) == 32:
                return key

        raise ValueError(f"{cls.KEY_ENV} must decode to exactly 32 bytes")

    @classmethod
    def encrypt_bind_password(cls, plain_text: str) -> str:
        if plain_text is None:
            return ""
        text = str(plain_text)
        if text == "":
            return ""
        aesgcm = AESGCM(cls._load_key())
        nonce = os.urandom(12)
        cipher = aesgcm.encrypt(nonce, text.encode("utf-8"), None)
        nonce_b64 = base64.urlsafe_b64encode(nonce).decode("utf-8").rstrip("=")
        cipher_b64 = base64.urlsafe_b64encode(cipher).decode("utf-8").rstrip("=")
        return f"{cls.KEY_VERSION}:{nonce_b64}:{cipher_b64}"

    @classmethod
    def decrypt_bind_password(cls, encrypted_text: str) -> str:
        value = (encrypted_text or "").strip()
        if value == "":
            return ""

        parts = value.split(":")
        if len(parts) != 3 or parts[0] != cls.KEY_VERSION:
            raise ValueError("Unsupported bind password ciphertext format")

        nonce_raw = base64.urlsafe_b64decode(parts[1] + ("=" * (-len(parts[1]) % 4)))
        cipher_raw = base64.urlsafe_b64decode(parts[2] + ("=" * (-len(parts[2]) % 4)))
        plain = AESGCM(cls._load_key()).decrypt(nonce_raw, cipher_raw, None)
        return plain.decode("utf-8")

