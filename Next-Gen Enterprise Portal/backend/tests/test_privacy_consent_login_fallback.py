from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from fastapi import Request
from fastapi.exceptions import HTTPException


BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.iam.services import privacy_consent


def _build_request(*, headers: dict[str, str] | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/portal/auth/token",
        "headers": [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in (headers or {}).items()
        ],
    }
    return Request(scope)


class PrepareLoginPrivacyConsentFallbackTests(IsolatedAsyncioTestCase):
    async def test_accepts_form_backfilled_state_when_headers_are_missing(self) -> None:
        request = _build_request()
        request.state.privacy_consent_accepted = "true"
        request.state.privacy_policy_version = "v1"
        request.state.privacy_policy_hash = "hash-123"
        request.state.privacy_consent_locale = "zh-CN"

        snapshot = privacy_consent.PrivacyPolicySnapshot(
            text="privacy",
            version="v1",
            policy_hash="hash-123",
            required=True,
            configured=True,
        )
        user = SimpleNamespace(id=7, username="houyuxi")

        with (
            patch.object(
                privacy_consent,
                "load_privacy_policy_snapshot",
                AsyncMock(return_value=snapshot),
            ),
            patch.object(
                privacy_consent,
                "get_current_consent",
                AsyncMock(return_value=None),
            ),
        ):
            result = await privacy_consent.prepare_login_privacy_consent(
                db=SimpleNamespace(),
                request=request,
                user=user,
                audience="portal",
            )

        self.assertIsNotNone(result)
        self.assertEqual(result.policy_version, "v1")
        self.assertEqual(result.policy_hash, "hash-123")
        self.assertEqual(result.locale, "zh-CN")

    async def test_requires_consent_when_headers_and_state_are_missing(self) -> None:
        request = _build_request()
        snapshot = privacy_consent.PrivacyPolicySnapshot(
            text="privacy",
            version="v1",
            policy_hash="hash-123",
            required=True,
            configured=True,
        )
        user = SimpleNamespace(id=7, username="houyuxi")

        with (
            patch.object(
                privacy_consent,
                "load_privacy_policy_snapshot",
                AsyncMock(return_value=snapshot),
            ),
            patch.object(
                privacy_consent,
                "get_current_consent",
                AsyncMock(return_value=None),
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await privacy_consent.prepare_login_privacy_consent(
                    db=SimpleNamespace(),
                    request=request,
                    user=user,
                    audience="portal",
                )

        self.assertEqual(ctx.exception.status_code, 428)
        self.assertEqual(ctx.exception.detail["code"], "PRIVACY_CONSENT_REQUIRED")
