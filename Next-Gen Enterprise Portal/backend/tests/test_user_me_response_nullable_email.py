from __future__ import annotations

from unittest import TestCase

from iam.identity.schemas import UserMeResponse as IdentityUserMeResponse
from modules.iam.schemas import UserMeResponse as ModuleUserMeResponse


class UserMeResponseNullableEmailTests(TestCase):
    def test_identity_user_me_response_allows_null_email(self):
        payload = IdentityUserMeResponse(
            id=1,
            username="portal-user",
            email=None,
            roles=[],
            permissions=[],
        )

        self.assertIsNone(payload.email)

    def test_module_user_me_response_allows_null_email(self):
        payload = ModuleUserMeResponse(
            id=1,
            username="portal-user",
            email=None,
            roles=[],
            permissions=[],
        )

        self.assertIsNone(payload.email)
