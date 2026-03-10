from __future__ import annotations

from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, Response

from iam.identity.service import IdentityService, SessionStateStoreError
from modules.iam.routers import mfa as mfa_router
import modules.schemas as schemas


def _make_request(
    *,
    cookies: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    path: str = "/api/v1/admin/me",
):
    return SimpleNamespace(
        cookies=cookies or {},
        headers=headers or {},
        url=SimpleNamespace(path=path),
        client=SimpleNamespace(host="127.0.0.1"),
    )


class _ScalarResult:
    def __init__(self, values):
        if isinstance(values, list):
            self._values = values
        else:
            self._values = [values]

    def scalars(self):
        return self

    def first(self):
        return self._values[0] if self._values else None

    def all(self):
        return list(self._values)


class _FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.commit = AsyncMock()

    async def execute(self, *_args, **_kwargs):
        if not self._results:
            raise AssertionError("Unexpected DB execute call in test.")
        return self._results.pop(0)


class SessionFailClosedTests(IsolatedAsyncioTestCase):
    async def test_get_current_user_accepts_bearer_token_when_audience_is_explicit(self):
        request = _make_request(headers={"Authorization": "Bearer token"})
        user = SimpleNamespace(id=1, username="admin", is_active=True, roles=[])
        db = _FakeDB([_ScalarResult(user)])

        with (
            patch("iam.identity.service.jwt.decode", return_value={"sub": "admin", "jti": "jti-1"}),
            patch.object(IdentityService, "_is_jti_revoked", AsyncMock(return_value=False)),
            patch.object(IdentityService, "_is_system_mfa_forced", AsyncMock(return_value=False)),
        ):
            current_user = await IdentityService.get_current_user(request, db=db, audience="admin")

        self.assertEqual(current_user.username, "admin")

    async def test_get_current_user_returns_503_when_denylist_check_fails(self):
        request = _make_request(cookies={"admin_session": "token"})

        with (
            patch("iam.identity.service.jwt.decode", return_value={"sub": "admin", "jti": "jti-1"}),
            patch.object(
                IdentityService,
                "_is_jti_revoked",
                AsyncMock(side_effect=SessionStateStoreError("redis down")),
            ),
        ):
            with self.assertRaises(HTTPException) as exc:
                await IdentityService.get_current_user(request, db=object(), audience="admin")

        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(exc.exception.detail["code"], IdentityService.AUTH_CODE_SESSION_STATE_UNAVAILABLE)

    async def test_logout_returns_503_when_token_revocation_cannot_be_persisted(self):
        request = _make_request(cookies={"admin_session": "token"})
        response = Response()

        with (
            patch.object(
                IdentityService,
                "_resolve_current_identity",
                AsyncMock(return_value=(SimpleNamespace(id=1, username="admin"), "admin")),
            ),
            patch.object(IdentityService, "_collect_request_tokens", return_value=["token"]),
            patch.object(
                IdentityService,
                "_revoke_token",
                AsyncMock(side_effect=SessionStateStoreError("redis down")),
            ),
        ):
            with self.assertRaises(HTTPException) as exc:
                await IdentityService.logout(response, request=request, db=object())

        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(exc.exception.detail["code"], IdentityService.AUTH_CODE_SESSION_STATE_UNAVAILABLE)

    async def test_logout_all_returns_503_when_bulk_revocation_fails(self):
        request = _make_request(cookies={"admin_session": "token"})
        response = Response()
        current_user = SimpleNamespace(id=7, username="admin")

        with (
            patch.object(
                IdentityService,
                "_resolve_current_identity",
                AsyncMock(return_value=(current_user, "admin")),
            ),
            patch.object(IdentityService, "_resolve_audiences", return_value=["admin"]),
            patch.object(
                IdentityService,
                "_revoke_all_sessions_for_user",
                AsyncMock(side_effect=SessionStateStoreError("redis down")),
            ),
        ):
            with self.assertRaises(HTTPException) as exc:
                await IdentityService.logout_all(
                    response=response,
                    request=request,
                    db=object(),
                    audience_scope="admin",
                )

        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(exc.exception.detail["code"], IdentityService.AUTH_CODE_SESSION_STATE_UNAVAILABLE)

    async def test_verify_mfa_challenge_returns_503_when_session_tracking_fails(self):
        request = _make_request(path="/api/v1/mfa/verify")
        response = Response()
        user = SimpleNamespace(
            id=11,
            username="admin",
            is_active=True,
            totp_secret="JBSWY3DPEHPK3PXP",
            roles=[],
        )
        db = _FakeDB([
            _ScalarResult(user),
            _ScalarResult([]),
        ])
        payload = schemas.MfaChallengeVerifyRequest(
            mfa_token="mfa-token",
            totp_code="123456",
        )

        with (
            patch("jose.jwt.decode", return_value={"sub": "admin", "uid": 11, "provider": "admin"}),
            patch.object(mfa_router, "_get_enabled_mfa_methods", AsyncMock(return_value=["totp"])),
            patch.object(mfa_router, "consume_mfa_privacy_claims", AsyncMock(return_value=None)),
            patch("pyotp.TOTP.verify", return_value=True),
            patch("modules.iam.routers.mfa.security.create_access_token", return_value="session-token"),
            patch.object(
                IdentityService,
                "_extract_token_session_meta",
                AsyncMock(return_value=(11, "admin", "new-jti", 9999999999)),
            ),
            patch.object(
                IdentityService,
                "_add_active_session",
                AsyncMock(side_effect=SessionStateStoreError("redis down")),
            ),
        ):
            with self.assertRaises(HTTPException) as exc:
                await mfa_router.verify_mfa_challenge(
                    request=request,
                    response=response,
                    payload=payload,
                    db=db,
                )

        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(exc.exception.detail["code"], IdentityService.AUTH_CODE_SESSION_STATE_UNAVAILABLE)
