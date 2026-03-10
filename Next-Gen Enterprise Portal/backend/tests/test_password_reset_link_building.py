from __future__ import annotations

import unittest
from types import SimpleNamespace

from modules.iam.services.password_reset_links import build_password_reset_link


class PasswordResetLinkBuildingTests(unittest.TestCase):
    def _build_request(self, *, scheme: str = "https", host: str = "gateway.example.com", headers: dict[str, str] | None = None):
        normalized_headers = headers or {}
        return SimpleNamespace(
            headers=normalized_headers,
            url=SimpleNamespace(scheme=scheme, netloc=host),
        )

    def test_portal_reset_link_uses_configured_public_base_url(self) -> None:
        request = self._build_request()

        link = build_password_reset_link(
            request,
            "portal",
            "portal-token",
            config_map={"platform_public_base_url": "https://portal.customer.example.com/workbench"},
        )

        self.assertEqual(
            link,
            "https://portal.customer.example.com/workbench/login?reset_token=portal-token&audience=portal",
        )

    def test_admin_reset_link_prefers_admin_base_url(self) -> None:
        request = self._build_request()

        link = build_password_reset_link(
            request,
            "admin",
            "admin-token",
            config_map={
                "platform_public_base_url": "https://portal.customer.example.com/workbench",
                "platform_admin_base_url": "https://portal.customer.example.com/control",
            },
        )

        self.assertEqual(
            link,
            "https://portal.customer.example.com/control/login?reset_token=admin-token&audience=admin",
        )

    def test_admin_reset_link_falls_back_to_public_base_admin_path(self) -> None:
        request = self._build_request()

        link = build_password_reset_link(
            request,
            "admin",
            "admin-token",
            config_map={"platform_public_base_url": "https://portal.customer.example.com/workbench"},
        )

        self.assertEqual(
            link,
            "https://portal.customer.example.com/workbench/admin/login?reset_token=admin-token&audience=admin",
        )

    def test_reset_link_falls_back_to_request_origin_when_config_missing(self) -> None:
        request = self._build_request(headers={"x-forwarded-proto": "https", "x-forwarded-host": "edge.example.com"})

        portal_link = build_password_reset_link(request, "portal", "portal-token")
        admin_link = build_password_reset_link(request, "admin", "admin-token")

        self.assertEqual(
            portal_link,
            "https://edge.example.com/login?reset_token=portal-token&audience=portal",
        )
        self.assertEqual(
            admin_link,
            "https://edge.example.com/admin/login?reset_token=admin-token&audience=admin",
        )


if __name__ == "__main__":
    unittest.main()
