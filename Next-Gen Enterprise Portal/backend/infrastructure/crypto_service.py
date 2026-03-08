
from cryptography.fernet import Fernet
import logging

from core.runtime_secrets import get_env, get_required_env
from modules.iam.services.system_config_security import _normalize_fernet_key

logger = logging.getLogger(__name__)

class CryptoService:
    _fernet = None

    @classmethod
    def get_fernet(cls):
        if cls._fernet is None:
            cls._fernet = Fernet(_normalize_fernet_key(get_required_env("MASTER_KEY")))
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
        candidates: list[Fernet] = [cls.get_fernet()]
        previous_master_key = str(get_env("MASTER_KEY_PREVIOUS") or "").strip()
        if previous_master_key:
            candidates.append(Fernet(_normalize_fernet_key(previous_master_key)))

        for fernet in candidates:
            try:
                return fernet.decrypt(cipher_text.encode()).decode()
            except Exception:
                continue
        raise RuntimeError("Failed to decrypt ciphertext. Check MASTER_KEY rotation settings.")

crypto_service = CryptoService()
