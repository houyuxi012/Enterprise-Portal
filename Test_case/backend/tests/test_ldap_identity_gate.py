import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response
from starlette.requests import Request

_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for _candidate in (
    os.path.join(_repo_root, "Next-Gen Enterprise Portal", "backend"),
    os.path.join(_repo_root, "code", "backend"),
    os.path.join(_repo_root, "backend"),
    _repo_root,
):
    if os.path.isdir(_candidate) and _candidate not in sys.path:
        sys.path.append(_candidate)

import modules.models as models
import modules.schemas as schemas
from modules.iam.routers.iam_directories import (
    _to_out,
    create_directory_config,
    test_directory_connection_draft,
    test_directory_connection as run_directory_connection_test,
)
from modules.iam.services.identity.identity_service import ProviderIdentityService
from modules.iam.services.identity.providers.ldap import LdapIdentityProvider
from modules.admin.services.license_service import LicenseService


class _FakeDB:
    async def commit(self):
        return None


def _request(path: str) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "query_string": b"",
        "headers": [],
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 12345),
        "http_version": "1.1",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_ldap_feature_gate_denied(monkeypatch):
    async def _deny_feature(cls, db, feature: str):
        raise HTTPException(
            status_code=403,
            detail={"code": "LICENSE_REQUIRED", "message": "license required"},
        )

    monkeypatch.setattr(LicenseService, "require_feature", classmethod(_deny_feature))

    request = _request("/api/iam/admin/directories/")
    payload = schemas.DirectoryConfigCreate(
        name="Corp AD",
        type="ad",
        host="ldap.example.com",
        port=389,
        use_ssl=False,
        start_tls=True,
        bind_dn="CN=svc,DC=example,DC=com",
        bind_password="secret",
        base_dn="DC=example,DC=com",
        enabled=True,
    )
    actor = SimpleNamespace(id=1, username="admin")
    db = _FakeDB()

    with pytest.raises(HTTPException) as create_exc:
        await create_directory_config(payload, request, db=db, operator=actor)
    assert create_exc.value.status_code == 403
    assert create_exc.value.detail["code"] == "LICENSE_REQUIRED"

    with pytest.raises(HTTPException) as test_exc:
        await run_directory_connection_test(
            1,
            schemas.DirectoryConnectionTestRequest(username="tom", password="pass"),
            request,
            db=db,
            operator=actor,
        )
    assert test_exc.value.status_code == 403
    assert test_exc.value.detail["code"] == "LICENSE_REQUIRED"

    with pytest.raises(HTTPException) as draft_test_exc:
        await test_directory_connection_draft(
            schemas.DirectoryConnectionDraftTestRequest(
                type="ldap",
                host="ldap.example.com",
                port=389,
                use_ssl=False,
                start_tls=False,
                bind_dn="CN=svc,DC=example,DC=com",
                bind_password="secret",
                base_dn="DC=example,DC=com",
                user_filter="(&(objectClass=user)(sAMAccountName={username}))",
                username_attr="sAMAccountName",
                email_attr="mail",
                display_name_attr="displayName",
            ),
            request,
            db=db,
            operator=actor,
        )
    assert draft_test_exc.value.status_code == 403
    assert draft_test_exc.value.detail["code"] == "LICENSE_REQUIRED"

    provider = LdapIdentityProvider()
    with pytest.raises(HTTPException) as auth_exc:
        await provider.authenticate(
            db=db,
            username="tom",
            password="pass",
            directory_config=SimpleNamespace(id=1, type="ldap"),
        )
    assert auth_exc.value.status_code == 403
    assert auth_exc.value.detail["code"] == "LICENSE_REQUIRED"


def test_directory_create_mask_password():
    now = datetime.now(timezone.utc)
    config = models.DirectoryConfig(
        id=7,
        name="Corp AD",
        type="ad",
        host="ldap.example.com",
        port=636,
        use_ssl=True,
        start_tls=False,
        bind_dn="CN=svc,DC=example,DC=com",
        bind_password_ciphertext="v1:nonce:cipher",
        base_dn="DC=example,DC=com",
        user_filter="(&(objectClass=user)(sAMAccountName={username}))",
        username_attr="sAMAccountName",
        email_attr="mail",
        display_name_attr="displayName",
        enabled=True,
        created_at=now,
        updated_at=now,
    )
    out = _to_out(config)
    payload = out.model_dump() if hasattr(out, "model_dump") else out.dict()
    assert "bind_password" not in payload
    assert payload["has_bind_password"] is True


@pytest.mark.asyncio
async def test_public_api_login_ldap_denied_without_license(monkeypatch):
    async def _deny_feature(cls, db, feature: str):
        raise HTTPException(
            status_code=403,
            detail={"code": "LICENSE_REQUIRED", "message": "license required"},
        )

    async def _fake_get_enabled_directory(cls, db, *, provider: str):
        return SimpleNamespace(
            id=42,
            type="ad",
            host="ldap.example.com",
            port=389,
            use_ssl=False,
            start_tls=True,
            bind_dn="CN=svc,DC=example,DC=com",
            bind_password_ciphertext="v1:nonce:cipher",
            base_dn="DC=example,DC=com",
            user_filter="(&(objectClass=user)(sAMAccountName={username}))",
            username_attr="sAMAccountName",
            email_attr="mail",
            display_name_attr="displayName",
            enabled=True,
        )

    async def _noop_audit(*args, **kwargs):
        return None

    monkeypatch.setattr(LicenseService, "require_feature", classmethod(_deny_feature))
    monkeypatch.setattr(
        ProviderIdentityService,
        "_get_enabled_directory",
        classmethod(_fake_get_enabled_directory),
    )
    monkeypatch.setattr(
        "services.identity.identity_service.IAMAuditService.log",
        _noop_audit,
        raising=True,
    )

    request = _request("/api/portal/auth/token")
    response = Response()
    db = _FakeDB()

    with pytest.raises(HTTPException) as exc_info:
        await ProviderIdentityService.authenticate_portal(
            db=db,
            request=request,
            response=response,
            username="tom",
            password="wrong",
            provider="ldap",
        )

    assert exc_info.value.status_code == 403
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["code"] == "LICENSE_REQUIRED"
