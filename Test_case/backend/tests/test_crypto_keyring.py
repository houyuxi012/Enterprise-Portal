import base64
import os
import sys

import pytest

_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for _candidate in (
    os.path.join(_repo_root, "code", "backend"),
    os.path.join(_repo_root, "backend"),
    _repo_root,
):
    if os.path.isdir(_candidate) and _candidate not in sys.path:
        sys.path.append(_candidate)

from services.crypto_keyring import BindPasswordKeyring, KeyringConfigError


def _b64_key(seed: str) -> str:
    raw = seed.encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


@pytest.fixture(autouse=True)
def _reset_keyring_cache():
    BindPasswordKeyring.clear_cache()
    yield
    BindPasswordKeyring.clear_cache()


def test_keyring_roundtrip(monkeypatch):
    monkeypatch.setenv(
        "BIND_PASSWORD_ENC_KEYS",
        '{"k2026q1":"MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY"}',
    )
    monkeypatch.setenv("BIND_PASSWORD_ENC_ACTIVE_KID", "k2026q1")

    aad = b"bind_password:1"
    cipher = BindPasswordKeyring.encrypt_bind_password("admin123!", aad=aad)
    plain = BindPasswordKeyring.decrypt_bind_password(cipher, aad=aad)

    assert cipher.startswith("enc:v1:k2026q1:")
    assert plain == "admin123!"


def test_keyring_rotation_read_old_write_new(monkeypatch):
    old_key = _b64_key("0123456789abcdef0123456789abcdef")
    new_key = _b64_key("abcdef0123456789abcdef0123456789")

    monkeypatch.setenv(
        "BIND_PASSWORD_ENC_KEYS",
        f'{{"k2025q4":"{old_key}","k2026q1":"{new_key}"}}',
    )
    monkeypatch.setenv("BIND_PASSWORD_ENC_ACTIVE_KID", "k2025q4")
    old_cipher = BindPasswordKeyring.encrypt_bind_password("legacy-pass", aad=b"bind_password:8")

    monkeypatch.setenv(
        "BIND_PASSWORD_ENC_KEYS",
        f'{{"k2025q4":"{old_key}","k2026q1":"{new_key}"}}',
    )
    monkeypatch.setenv("BIND_PASSWORD_ENC_ACTIVE_KID", "k2026q1")
    BindPasswordKeyring.clear_cache()

    assert BindPasswordKeyring.decrypt_bind_password(old_cipher, aad=b"bind_password:8") == "legacy-pass"
    new_cipher = BindPasswordKeyring.encrypt_bind_password("new-pass", aad=b"bind_password:8")
    assert BindPasswordKeyring.parse_ciphertext_kid(new_cipher) == "k2026q1"


def test_keyring_unknown_kid(monkeypatch):
    old_key = _b64_key("0123456789abcdef0123456789abcdef")
    new_key = _b64_key("abcdef0123456789abcdef0123456789")

    monkeypatch.setenv(
        "BIND_PASSWORD_ENC_KEYS",
        f'{{"k2025q4":"{old_key}","k2026q1":"{new_key}"}}',
    )
    monkeypatch.setenv("BIND_PASSWORD_ENC_ACTIVE_KID", "k2025q4")
    old_cipher = BindPasswordKeyring.encrypt_bind_password("legacy-pass", aad=b"bind_password:9")

    monkeypatch.setenv("BIND_PASSWORD_ENC_KEYS", f'{{"k2026q1":"{new_key}"}}')
    monkeypatch.setenv("BIND_PASSWORD_ENC_ACTIVE_KID", "k2026q1")
    BindPasswordKeyring.clear_cache()

    with pytest.raises(KeyringConfigError) as exc_info:
        BindPasswordKeyring.decrypt_bind_password(old_cipher, aad=b"bind_password:9")
    assert exc_info.value.code == BindPasswordKeyring.CODE_UNKNOWN_KID


def test_keyring_invalid_key_length_fail_fast(monkeypatch):
    short_key = base64.urlsafe_b64encode(b"short-key").decode("utf-8").rstrip("=")
    monkeypatch.setenv("BIND_PASSWORD_ENC_KEYS", f'{{"k2026q1":"{short_key}"}}')
    monkeypatch.setenv("BIND_PASSWORD_ENC_ACTIVE_KID", "k2026q1")

    with pytest.raises(KeyringConfigError) as exc_info:
        BindPasswordKeyring.load_keyring()
    assert "32 bytes" in str(exc_info.value)
