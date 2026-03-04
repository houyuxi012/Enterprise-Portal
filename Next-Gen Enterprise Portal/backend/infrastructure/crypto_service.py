
from cryptography.fernet import Fernet
import base64
import logging
import os
import hashlib

logger = logging.getLogger(__name__)

class CryptoService:
    _fernet = None

    @classmethod
    def get_fernet(cls):
        if cls._fernet is None:
            secret_key = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
            # Fernet requires a 32-byte url-safe base64-encoded key.
            # We derive it from SECRET_KEY to ensure consistency.
            key = hashlib.sha256(secret_key.encode()).digest()
            cls._fernet = Fernet(base64.urlsafe_b64encode(key))
        return cls._fernet

    @classmethod
    def encrypt_data(cls, plain_text: str) -> str:
        """Encrypts data using AES (Fernet). Returns base64 string."""
        if not plain_text:
            return plain_text
        f = cls.get_fernet()
        return f.encrypt(plain_text.encode()).decode()

    @classmethod
    def decrypt_data(cls, cipher_text: str) -> str:
        """Decrypts data using AES (Fernet). Returns plain text."""
        if not cipher_text:
            return cipher_text
        try:
            f = cls.get_fernet()
            return f.decrypt(cipher_text.encode()).decode()
        except Exception as e:
            # Fallback for legacy plain text or invalid tokens
            # logger.warning(f"Failed to decrypt data, assuming plain text: {e}")
            return cipher_text

crypto_service = CryptoService()
