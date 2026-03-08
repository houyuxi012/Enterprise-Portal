from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.admin.routers import system as system_router


class _WorkingDirectoryMixin:
    def enter_temp_workdir(self) -> Path:
        tmp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(tmp_dir.cleanup)

        original_cwd = Path.cwd()
        os.chdir(tmp_dir.name)
        self.addCleanup(os.chdir, original_cwd)
        return Path(tmp_dir.name)


class VersionMetadataLoadTests(_WorkingDirectoryMixin, TestCase):
    def test_load_version_info_returns_defaults_when_file_is_missing(self):
        self.enter_temp_workdir()

        self.assertEqual(system_router._load_version_info(), system_router.VERSION_DEFAULTS)

    def test_load_version_info_merges_payload_with_defaults(self):
        workdir = self.enter_temp_workdir()
        payload = {
            "product": "Portal Test",
            "version": "2.0.1",
            "git_ref": "release/2.0",
            "db_schema_version": "20260306_0005",
        }
        (workdir / "VERSION.json").write_text(json.dumps(payload), encoding="utf-8")

        loaded = system_router._load_version_info()

        self.assertEqual(loaded["product"], "Portal Test")
        self.assertEqual(loaded["version"], "2.0.1")
        self.assertEqual(loaded["git_ref"], "release/2.0")
        self.assertEqual(loaded["db_schema_version"], "20260306_0005")
        self.assertEqual(loaded["channel"], system_router.VERSION_DEFAULTS["channel"])
        self.assertEqual(loaded["api_version"], system_router.VERSION_DEFAULTS["api_version"])

    def test_load_version_info_returns_defaults_when_json_is_invalid(self):
        workdir = self.enter_temp_workdir()
        (workdir / "VERSION.json").write_text("{invalid-json", encoding="utf-8")

        self.assertEqual(system_router._load_version_info(), system_router.VERSION_DEFAULTS)


class VersionEndpointTests(IsolatedAsyncioTestCase):
    async def test_get_system_version_exposes_git_ref_and_db_schema_version(self):
        version_info = {
            **system_router.VERSION_DEFAULTS,
            "product": "Portal Test",
            "product_id": "portal-test",
            "version": "2.0.1-beta.42",
            "semver": "2.0.1",
            "channel": "beta",
            "git_ref": "release/2.0",
            "db_schema_version": "20260306_0005",
            "build_number": "42",
            "build_id": "20260306170000",
        }

        with patch.object(system_router, "_load_version_info", return_value=version_info):
            payload = await system_router.get_system_version(None)

        self.assertEqual(payload["product"], "Portal Test")
        self.assertEqual(payload["product_id"], "portal-test")
        self.assertEqual(payload["version"], "2.0.1-beta.42")
        self.assertEqual(payload["git_ref"], "release/2.0")
        self.assertEqual(payload["db_schema_version"], "20260306_0005")
        self.assertEqual(payload["build_number"], "42")
        self.assertEqual(payload["build_id"], "20260306170000")


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
        next_result = self._execute_results.pop(0)
        if isinstance(next_result, Exception):
            raise next_result
        return next_result


class SystemInfoEndpointTests(IsolatedAsyncioTestCase):
    async def test_get_system_info_uses_configured_public_base_and_license_payload(self):
        request = SimpleNamespace(
            url=SimpleNamespace(hostname="portal.example.com"),
            base_url="https://portal.example.com/",
        )
        db = _FakeDB(
            [
                object(),
                _ScalarResult(
                    [
                        SimpleNamespace(key="platform_public_base_url", value="https://portal.example.com/root/"),
                    ]
                ),
            ]
        )
        current_user = SimpleNamespace(id=7, username="admin")
        version_info = {
            **system_router.VERSION_DEFAULTS,
            "product": "Portal Test",
            "version": "2.0.1",
            "git_ref": "release/2.0",
            "build_id": "20260306171000",
            "api_version": "v2",
        }
        license_payload = {
            "installation_id": "INSTALL-001",
            "status": "active",
            "reason": "",
            "grant_type": "subscription",
            "customer": "Acme Corp",
            "expires_at": "2027-01-01T00:00:00Z",
        }

        with (
            patch.object(system_router, "_load_version_info", return_value=version_info),
            patch.object(system_router.LicenseService, "get_license_status", return_value=license_payload),
        ):
            payload = await system_router.get_system_info(request, db, current_user)

        self.assertEqual(payload["software_name"], "Portal Test")
        self.assertEqual(payload["version"], "2.0.1")
        self.assertEqual(payload["database"], "已连接")
        self.assertEqual(payload["access_address"], "https://portal.example.com/root")
        self.assertEqual(payload["license_status"], "active")
        self.assertEqual(payload["license_type"], "subscription")
        self.assertEqual(payload["authorized_unit"], "Acme Corp")
        self.assertEqual(payload["license_expires_at"], "2027-01-01T00:00:00Z")
        self.assertFalse(payload["license_expired"])
        self.assertEqual(payload["git_ref"], "release/2.0")
        self.assertEqual(payload["build_id"], "20260306171000")
        self.assertEqual(payload["api_version"], "v2")

    async def test_get_system_info_does_not_reflect_untrusted_host_headers(self):
        request = SimpleNamespace(
            url=SimpleNamespace(hostname="evil.example.net"),
            base_url="https://evil.example.net/",
        )
        db = _FakeDB(
            [
                object(),
                _ScalarResult(
                    [
                        SimpleNamespace(key="platform_public_base_url", value=""),
                        SimpleNamespace(key="platform_domain", value=""),
                    ]
                ),
            ]
        )
        current_user = SimpleNamespace(id=7, username="admin")
        version_info = {**system_router.VERSION_DEFAULTS}

        with (
            patch.object(system_router, "_load_version_info", return_value=version_info),
            patch.object(
                system_router.LicenseService,
                "get_license_status",
                return_value={"installation_id": "INSTALL-002", "status": "missing", "reason": ""},
            ),
        ):
            payload = await system_router.get_system_info(request, db, current_user)

        self.assertEqual(payload["access_address"], "未配置")
        self.assertEqual(payload["database"], "已连接")

    async def test_get_system_info_falls_back_when_license_service_or_db_probe_fails(self):
        request = SimpleNamespace(
            url=SimpleNamespace(hostname="127.0.0.1"),
            base_url="https://127.0.0.1/",
        )
        db = _FakeDB(
            [
                RuntimeError("db down"),
                _ScalarResult([]),
            ]
        )
        current_user = SimpleNamespace(id=7, username="admin")
        version_info = {**system_router.VERSION_DEFAULTS}

        with (
            patch.object(system_router, "_load_version_info", return_value=version_info),
            patch.object(
                system_router.LicenseService,
                "get_license_status",
                side_effect=RuntimeError("license service unavailable"),
            ),
            patch.object(system_router, "_build_system_serial_number", return_value="SERIAL-FALLBACK"),
        ):
            payload = await system_router.get_system_info(request, db, current_user)

        self.assertEqual(payload["database"], "连接失败")
        self.assertEqual(payload["access_address"], "https://127.0.0.1")
        self.assertEqual(payload["serial_number"], "SERIAL-FALLBACK")
        self.assertEqual(payload["license_id"], "SERIAL-FALLBACK")
        self.assertEqual(payload["license_status"], "missing")
        self.assertEqual(payload["authorized_unit"], "-")
        self.assertFalse(payload["license_expired"])
