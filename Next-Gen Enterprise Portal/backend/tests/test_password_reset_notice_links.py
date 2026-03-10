from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from modules.iam.services.email_service import DEFAULT_PORTAL_LOGIN_URL, send_password_reset_notice


class PasswordResetNoticeLinkTests(unittest.TestCase):
    def test_notice_uses_platform_public_base_url_when_action_link_missing(self) -> None:
        async def _run() -> AsyncMock:
            send_email_mock = AsyncMock()
            template = SimpleNamespace(
                category="email",
                default_locale="zh-CN",
                subject="您的账号密码已被重置",
                content='<p><a href="{{action_link}}">立即登录</a></p>',
                variables=["action_link"],
            )
            with (
                patch(
                    "modules.iam.services.email_service.get_notification_email_branding",
                    AsyncMock(
                        return_value={
                            "app_name": "Customer Portal",
                            "footer_text": "Customer Portal",
                            "logo_url": "",
                            "public_base_url": "https://portal.customer.example.com",
                        }
                    ),
                ),
                patch(
                    "modules.iam.services.email_service.fetch_notification_template_by_code",
                    AsyncMock(return_value=template),
                ),
                patch(
                    "modules.iam.services.email_service.send_email_message",
                    send_email_mock,
                ),
            ):
                await send_password_reset_notice(
                    to_email="user@example.com",
                    username="alice",
                    db=SimpleNamespace(),
                    locale="zh-CN",
                )
            return send_email_mock

        send_email_mock = asyncio.run(_run())
        html_body = send_email_mock.await_args.kwargs["html_body"]

        self.assertIn('<a href="https://portal.customer.example.com">立即登录</a>', html_body)
        self.assertNotIn(DEFAULT_PORTAL_LOGIN_URL, html_body)

    def test_notice_prefers_explicit_action_link_over_platform_public_base_url(self) -> None:
        async def _run() -> AsyncMock:
            send_email_mock = AsyncMock()
            template = SimpleNamespace(
                category="email",
                default_locale="zh-CN",
                subject="您的账号密码已被重置",
                content='<p><a href="{{action_link}}">立即登录</a></p>',
                variables=["action_link"],
            )
            with (
                patch(
                    "modules.iam.services.email_service.get_notification_email_branding",
                    AsyncMock(
                        return_value={
                            "app_name": "Customer Portal",
                            "footer_text": "Customer Portal",
                            "logo_url": "",
                            "public_base_url": "https://portal.customer.example.com",
                        }
                    ),
                ),
                patch(
                    "modules.iam.services.email_service.fetch_notification_template_by_code",
                    AsyncMock(return_value=template),
                ),
                patch(
                    "modules.iam.services.email_service.send_email_message",
                    send_email_mock,
                ),
            ):
                await send_password_reset_notice(
                    to_email="user@example.com",
                    username="alice",
                    db=SimpleNamespace(),
                    action_link="https://portal.customer.example.com/login",
                    locale="zh-CN",
                )
            return send_email_mock

        send_email_mock = asyncio.run(_run())
        html_body = send_email_mock.await_args.kwargs["html_body"]

        self.assertIn('<a href="https://portal.customer.example.com/login">立即登录</a>', html_body)
        self.assertNotIn(f'<a href="{DEFAULT_PORTAL_LOGIN_URL}">立即登录</a>', html_body)


if __name__ == "__main__":
    unittest.main()
