import asyncio
import sys
import types
from pathlib import Path

import pytest

from importlib import import_module


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "Next-Gen Enterprise Portal" / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _import_email_service():
    if "aiosmtplib" not in sys.modules:
        mock = types.SimpleNamespace()

        async def _noop_send(*args, **kwargs):
            return None

        mock.send = _noop_send
        sys.modules["aiosmtplib"] = mock
    if "sqlalchemy" not in sys.modules:
        sqlalchemy = types.ModuleType("sqlalchemy")

        def _select(*args, **kwargs):
            return None

        sqlalchemy.select = _select
        sys.modules["sqlalchemy"] = sqlalchemy
    if "sqlalchemy.ext" not in sys.modules:
        sys.modules["sqlalchemy.ext"] = types.ModuleType("sqlalchemy.ext")
    if "sqlalchemy.ext.asyncio" not in sys.modules:
        sqlalchemy_asyncio = types.ModuleType("sqlalchemy.ext.asyncio")

        class _AsyncSession:
            pass

        sqlalchemy_asyncio.AsyncSession = _AsyncSession
        sys.modules["sqlalchemy.ext.asyncio"] = sqlalchemy_asyncio
    if "models" not in sys.modules:
        models_stub = types.ModuleType("models")

        class _SystemConfig:
            pass

        models_stub.SystemConfig = _SystemConfig
        sys.modules["models"] = models_stub
    if "services.cache_manager" not in sys.modules:
        cache_stub = types.ModuleType("services.cache_manager")

        class _CacheManager:
            pass

        cache_stub.CacheManager = _CacheManager
        sys.modules["services.cache_manager"] = cache_stub
    return import_module("services.email_service")


class _MemoryCache:
    def __init__(self):
        self.store = {}

    async def get(self, key, is_json=False):
        return self.store.get(key)

    async def set(self, key, value, ttl=None):
        self.store[key] = value
        return True

    async def delete(self, key):
        self.store.pop(key, None)
        return True


def test_verify_email_otp_locks_after_max_attempts(monkeypatch):
    email_service = _import_email_service()
    cache = _MemoryCache()
    asyncio.run(cache.set(f"{email_service.EMAIL_OTP_PREFIX}alice", "123456"))
    monkeypatch.setattr(email_service, "CacheManager", lambda: cache)

    for _ in range(email_service.EMAIL_OTP_MAX_VERIFY_ATTEMPTS):
        ok = asyncio.run(email_service.verify_email_otp("alice", "000000"))
        assert ok is False

    # After reaching threshold, correct code should still fail until a new OTP is issued.
    ok = asyncio.run(email_service.verify_email_otp("alice", "123456"))
    assert ok is False


def test_send_email_otp_has_rate_limit(monkeypatch):
    email_service = _import_email_service()
    cache = _MemoryCache()
    monkeypatch.setattr(email_service, "CacheManager", lambda: cache)
    async def _fake_get_smtp_config(db):
        return {
            "host": "smtp.example.com",
            "port": 587,
            "username": "noreply@example.com",
            "password": "x",
            "use_tls": True,
            "sender": "noreply@example.com",
        }

    monkeypatch.setattr(email_service, "_get_smtp_config", _fake_get_smtp_config)

    async def _fake_send(*args, **kwargs):
        return None

    monkeypatch.setattr(email_service.aiosmtplib, "send", _fake_send)

    code1 = asyncio.run(email_service.send_email_otp("alice@example.com", "alice", db=object()))
    assert len(code1) == 6 and code1.isdigit()

    with pytest.raises(ValueError):
        asyncio.run(email_service.send_email_otp("alice@example.com", "alice", db=object()))


def test_verify_email_otp_success_clears_state(monkeypatch):
    email_service = _import_email_service()
    cache = _MemoryCache()
    monkeypatch.setattr(email_service, "CacheManager", lambda: cache)
    asyncio.run(cache.set(f"{email_service.EMAIL_OTP_PREFIX}bob", "654321"))
    asyncio.run(cache.set(f"{email_service.EMAIL_OTP_FAIL_PREFIX}bob", "3"))

    ok = asyncio.run(email_service.verify_email_otp("bob", "654321"))
    assert ok is True
    assert asyncio.run(cache.get(f"{email_service.EMAIL_OTP_PREFIX}bob")) is None
    assert asyncio.run(cache.get(f"{email_service.EMAIL_OTP_FAIL_PREFIX}bob")) is None
