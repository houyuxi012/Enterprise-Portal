import unittest

from middleware.license_gate import LicenseGateMiddleware


class LicenseGateExemptionsTest(unittest.TestCase):
    def test_change_my_password_route_is_exempt(self) -> None:
        self.assertTrue(LicenseGateMiddleware._is_exempt("/api/v1/iam/users/me/password"))
        self.assertFalse(LicenseGateMiddleware._should_check("/api/v1/iam/users/me/password"))


if __name__ == "__main__":
    unittest.main()
