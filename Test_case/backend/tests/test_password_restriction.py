import pytest
from fastapi import HTTPException

from iam.identity.router import change_my_password
from iam.identity.schemas import PasswordChangeRequest
from iam.identity.service import IdentityService
from iam.rbac.router import reset_password
from iam.rbac.schemas import PasswordResetRequest


class FakeUser:
    def __init__(self, *, auth_source: str = "local"):
        self.id = 1
        self.username = "tester"
        self.auth_source = auth_source
        self.hashed_password = "hash"


class FakeRequest:
    def __init__(self):
        self.headers = {}
        self.client = None


class FakeResult:
    def __init__(self, user):
        self._user = user

    def scalars(self):
        class _Scalars:
            def __init__(self, user):
                self._user = user

            def first(self):
                return self._user

        return _Scalars(self._user)


class FakeDB:
    def __init__(self, user):
        self._user = user

    async def execute(self, _stmt):
        return FakeResult(self._user)


@pytest.mark.asyncio
async def test_change_password_external_source(monkeypatch):
    external_user = FakeUser(auth_source="ldap")

    async def _fake_current_user(_request, _db, audience=None):
        return external_user

    monkeypatch.setattr(IdentityService, "get_current_user", _fake_current_user)

    with pytest.raises(HTTPException) as exc_info:
        await change_my_password(
            request=FakeRequest(),
            payload=PasswordChangeRequest(old_password="old", new_password="new"),
            audience="portal",
            db=None,
        )

    assert exc_info.value.status_code == 409
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail.get("code") == "PASSWORD_MANAGED_EXTERNALLY"


@pytest.mark.asyncio
async def test_reset_password_external_source():
    external_user = FakeUser(auth_source="ad")
    db = FakeDB(external_user)

    with pytest.raises(HTTPException) as exc_info:
        await reset_password(
            request=FakeRequest(),
            payload=PasswordResetRequest(username="tester"),
            db=db,
            current_user=FakeUser(auth_source="local"),
        )

    assert exc_info.value.status_code == 409
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail.get("code") == "PASSWORD_MANAGED_EXTERNALLY"
