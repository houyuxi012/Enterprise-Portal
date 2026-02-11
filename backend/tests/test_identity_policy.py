import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

# Ensure `iam.*` imports resolve when running from repo root.
sys.path.append(os.path.join(os.getcwd(), "backend"))

from iam.identity.service import IdentityService


def _perm(code: str):
    return SimpleNamespace(code=code)


def _role(code: str, permissions: list[str] | None = None):
    permissions = permissions or []
    return SimpleNamespace(code=code, permissions=[_perm(p) for p in permissions])


def _user(account_type: str, roles: list | None = None):
    return SimpleNamespace(account_type=account_type, roles=roles or [], username="tester")


def _request_with_headers(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": headers or [],
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 12345),
        "http_version": "1.1",
    }
    return Request(scope)


def test_portal_without_admin_access_cannot_login_admin():
    portal_user = _user("PORTAL", roles=[_role("user")])
    assert IdentityService._can_login_admin(portal_user) is False


def test_portal_with_admin_access_permission_can_login_admin():
    portal_user = _user("PORTAL", roles=[_role("user", ["admin:access"])])
    assert IdentityService._can_login_admin(portal_user) is True


def test_portal_with_portal_admin_role_can_login_admin():
    portal_user = _user("PORTAL", roles=[_role("PortalAdmin")])
    assert IdentityService._can_login_admin(portal_user) is True


def test_system_account_can_login_admin():
    system_user = _user("SYSTEM", roles=[_role("SuperAdmin")])
    assert IdentityService._can_login_admin(system_user) is True


def test_system_account_cannot_login_portal():
    system_user = _user("SYSTEM", roles=[_role("SuperAdmin")])
    assert IdentityService._can_login_portal(system_user) is False


@pytest.mark.asyncio
async def test_admin_audience_rejects_authorization_header_without_admin_cookie():
    request = _request_with_headers([(b"authorization", b"Bearer any-token")])
    with pytest.raises(HTTPException) as exc_info:
        await IdentityService.get_current_user(request, db=None, audience="admin")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_portal_audience_rejects_authorization_header_without_portal_cookie():
    request = _request_with_headers([(b"authorization", b"Bearer any-token")])
    with pytest.raises(HTTPException) as exc_info:
        await IdentityService.get_current_user(request, db=None, audience="portal")
    assert exc_info.value.status_code == 401
