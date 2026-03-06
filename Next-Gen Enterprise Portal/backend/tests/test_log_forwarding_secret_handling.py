from __future__ import annotations

import os
import sys
import importlib
from types import SimpleNamespace
from types import ModuleType
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from modules.admin.services import log_forwarder
from modules.admin.services.log_forwarding_security import resolve_log_forwarding_secret_for_storage
from modules.iam.services.system_config_security import SYSTEM_CONFIG_SECRET_PREFIX
import modules.models as models
import modules.schemas as schemas


def _make_request():
    return SimpleNamespace(
        headers={"X-Request-ID": "req-log-forwarding-test"},
        client=SimpleNamespace(host="127.0.0.1"),
    )


def _load_logs_router():
    saved_modules = {
        "application": sys.modules.get("application"),
        "application.admin_app": sys.modules.get("application.admin_app"),
        "modules.iam.routers.auth": sys.modules.get("modules.iam.routers.auth"),
        "modules.admin.routers.logs": sys.modules.get("modules.admin.routers.logs"),
    }

    application_pkg = ModuleType("application")
    application_pkg.__path__ = []

    admin_app_stub = ModuleType("application.admin_app")

    class _StubAuditService:
        @staticmethod
        def schedule_business_action(*_args, **_kwargs):
            return None

    class _StubLicenseService:
        @staticmethod
        async def require_feature(*_args, **_kwargs):
            return None

    admin_app_stub.AuditService = _StubAuditService
    admin_app_stub.LicenseService = _StubLicenseService
    admin_app_stub.LogQuery = object
    admin_app_stub.get_log_repository = lambda: None
    admin_app_stub.invalidate_forwarding_cache = lambda: None

    auth_stub = ModuleType("modules.iam.routers.auth")

    async def _stub_get_current_user(*_args, **_kwargs):
        return None

    auth_stub.get_current_user = _stub_get_current_user

    try:
        sys.modules["application"] = application_pkg
        sys.modules["application.admin_app"] = admin_app_stub
        sys.modules["modules.iam.routers.auth"] = auth_stub
        sys.modules.pop("modules.admin.routers.logs", None)
        module = importlib.import_module("modules.admin.routers.logs")
    finally:
        sys.modules.pop("modules.admin.routers.logs", None)
        for name, value in saved_modules.items():
            if name == "modules.admin.routers.logs":
                continue
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value

    return module


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
        self.added: list[object] = []
        self.commit = AsyncMock()
        self.refresh = AsyncMock(side_effect=self._refresh)

    async def execute(self, *_args, **_kwargs):
        if not self._execute_results:
            raise AssertionError("Unexpected DB execute call in test.")
        return self._execute_results.pop(0)

    def add(self, item):
        self.added.append(item)

    async def _refresh(self, item):
        if getattr(item, "id", None) is None:
            item.id = len(self.added)


class _FakeAsyncClient:
    def __init__(self, *, response_status: int = 200):
        self.response_status = response_status
        self.calls: list[dict[str, object]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, endpoint, json=None, headers=None):
        self.calls.append(
            {
                "endpoint": endpoint,
                "json": json,
                "headers": headers or {},
            }
        )
        return SimpleNamespace(status_code=self.response_status)


class LogForwardingSecretHandlingTests(IsolatedAsyncioTestCase):
    async def test_create_log_config_encrypts_secret_and_masks_response(self):
        logs_router = _load_logs_router()
        db = _FakeDB()
        request = _make_request()
        current_user = SimpleNamespace(id=1, username="admin")
        payload = schemas.LogForwardingConfigCreate(
            type="WEBHOOK",
            endpoint="https://example.invalid/hook",
            port=None,
            secret_token="Plaintext-Forwarding-Token",
            enabled=True,
            log_types=["SYSTEM", "IAM"],
        )

        with (
            patch.dict(os.environ, {"MASTER_KEY": "unit-test-master-key"}, clear=False),
            patch.object(logs_router.AuditService, "schedule_business_action"),
            patch.object(logs_router, "invalidate_forwarding_cache"),
        ):
            result = await logs_router.create_log_config(
                request=request,
                background_tasks=SimpleNamespace(),
                config=payload,
                db=db,
                _=None,
                current_user=current_user,
            )

        self.assertEqual(len(db.added), 1)
        stored = db.added[0]
        self.assertIsInstance(stored, models.LogForwardingConfig)
        self.assertNotEqual(stored.secret_token, "Plaintext-Forwarding-Token")
        self.assertTrue(str(stored.secret_token).startswith(SYSTEM_CONFIG_SECRET_PREFIX))
        self.assertNotIn("secret_token", result)
        self.assertTrue(result["has_secret_token"])
        self.assertEqual(result["log_types"], ["SYSTEM", "IAM"])

    async def test_read_log_configs_hides_secret_token_from_response(self):
        logs_router = _load_logs_router()
        cfg = models.LogForwardingConfig(
            id=7,
            type="WEBHOOK",
            endpoint="https://example.invalid/hook",
            port=None,
            secret_token=f"{SYSTEM_CONFIG_SECRET_PREFIX}encrypted-token",
            enabled=False,
            log_types='["ACCESS"]',
        )
        db = _FakeDB([_ScalarResult([cfg])])

        with patch.object(logs_router, "_record_log_query_audit", AsyncMock()):
            result = await logs_router.read_log_configs(
                request=_make_request(),
                background_tasks=SimpleNamespace(),
                db=db,
                _=None,
                current_user=SimpleNamespace(id=1, username="admin"),
            )

        self.assertEqual(len(result), 1)
        self.assertNotIn("secret_token", result[0])
        self.assertTrue(result[0]["has_secret_token"])
        self.assertEqual(result[0]["log_types"], ["ACCESS"])

    async def test_forward_to_webhook_uses_decrypted_secret_in_headers(self):
        with patch.dict(os.environ, {"MASTER_KEY": "unit-test-master-key"}, clear=False):
            encrypted_secret = resolve_log_forwarding_secret_for_storage("Forwarder-Secret")

        cfg = models.LogForwardingConfig(
            id=9,
            type="WEBHOOK",
            endpoint="https://example.invalid/hook",
            port=None,
            secret_token=encrypted_secret,
            enabled=True,
        )
        fake_client = _FakeAsyncClient()

        with (
            patch.dict(os.environ, {"MASTER_KEY": "unit-test-master-key"}, clear=False),
            patch("modules.admin.services.log_forwarder.httpx.AsyncClient", return_value=fake_client),
        ):
            await log_forwarder._forward_to_webhook(cfg, {"event": "test"})

        self.assertEqual(len(fake_client.calls), 1)
        headers = fake_client.calls[0]["headers"]
        self.assertEqual(headers["Authorization"], "Bearer Forwarder-Secret")
        self.assertEqual(headers["X-Log-Token"], "Forwarder-Secret")
