from __future__ import annotations

import asyncio
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from modules.admin.services.notification_templates import (
    analyze_notification_template_definition,
    build_branded_email_html,
    build_notification_sample_context,
    build_sms_test_payload,
    extract_notification_template_variables,
    get_localized_notification_template_text,
    get_notification_email_branding,
    normalize_notification_template_i18n_map,
    render_notification_template,
    resolve_notification_template_id_from_config_map,
)


class NotificationTemplateRenderingTests(unittest.TestCase):
    def test_extract_notification_template_variables_merges_declared_and_placeholders(self) -> None:
        template = SimpleNamespace(
            category="email",
            subject="Hello {{user_name}}",
            subject_i18n={"zh-CN": "您好 {{user_name}}"},
            content="Code {{code}} expires at {{expires_at}}",
            content_i18n={"zh-CN": "验证码 {{code}} 将在 {{expires_at}} 过期"},
            variables=["code", "user_name"],
        )

        self.assertEqual(
            extract_notification_template_variables(template),
            ["code", "user_name", "expires_at"],
        )

    def test_render_notification_template_uses_sample_context(self) -> None:
        template = SimpleNamespace(
            category="email",
            subject="Hello {{user_name}}",
            content="Use code {{code}} before {{expires_at}}",
            variables=["user_name", "code", "expires_at"],
        )
        context = build_notification_sample_context(channel="email", recipient="admin@example.com")

        rendered = render_notification_template(template, context)

        self.assertIn("Hello", rendered["subject"])
        self.assertIn("123456", rendered["content"])
        self.assertEqual(rendered["variables"]["code"], "123456")
        self.assertIn("expires_at", rendered["variables"])

    def test_render_notification_template_uses_localized_subject_and_content(self) -> None:
        template = SimpleNamespace(
            category="email",
            subject="Reset your password",
            subject_i18n={"zh-CN": "重置您的密码"},
            content="Hello {{user_name}}",
            content_i18n={"zh-CN": "您好 {{user_name}}"},
            variables=["user_name"],
        )

        rendered = render_notification_template(template, {"user_name": "alice"}, locale="zh-CN")

        self.assertEqual(rendered["subject"], "重置您的密码")
        self.assertEqual(rendered["content"], "您好 alice")

    def test_render_notification_template_uses_default_locale_when_locale_not_provided(self) -> None:
        template = SimpleNamespace(
            category="email",
            default_locale="en-US",
            subject="您的验证码",
            subject_i18n={"zh-CN": "您的验证码", "en-US": "Your verification code"},
            content="您好 {{user_name}}",
            content_i18n={"zh-CN": "您好 {{user_name}}", "en-US": "Hello {{user_name}}"},
            variables=["user_name"],
        )

        rendered = render_notification_template(template, {"user_name": "alice"})

        self.assertEqual(rendered["subject"], "Your verification code")
        self.assertEqual(rendered["content"], "Hello alice")

    def test_render_notification_template_generates_branded_html_for_email(self) -> None:
        template = SimpleNamespace(
            category="email",
            subject="Reset your password",
            content="<p>Hello {{user_name}}</p><p><a href=\"{{reset_link}}\">Reset now</a></p>",
            variables=["user_name", "reset_link"],
        )

        rendered = render_notification_template(
            template,
            {"user_name": "alice", "reset_link": "https://portal.example.com/reset"},
            email_branding={
                "app_name": "ACME Portal",
                "logo_url": "https://cdn.example.com/logo.png",
                "footer_text": "ACME Portal",
                "public_base_url": "https://portal.example.com",
            },
        )

        self.assertEqual(rendered["subject"], "Reset your password")
        self.assertIn("Hello alice", rendered["content"])
        self.assertIn("ACME Portal", rendered["html_content"])
        self.assertIn("https://cdn.example.com/logo.png", rendered["html_content"])
        self.assertIn("Reset now", rendered["html_content"])

    def test_build_sms_test_payload_generates_provider_specific_values(self) -> None:
        template = SimpleNamespace(
            category="sms",
            subject="",
            content="Verification code {{code}} for {{user_name}}",
            variables=["code", "user_name"],
        )
        context = build_notification_sample_context(channel="sms", recipient="+8613812345678")

        payload = build_sms_test_payload(template, context)

        aliyun_params = json.loads(payload["aliyun_template_param"])
        self.assertEqual(aliyun_params["code"], "123456")
        self.assertEqual(payload["tencent_template_params"], "123456,admin")
        self.assertIn("123456", payload["twilio_message"])

    def test_build_notification_sample_context_uses_public_base_url_for_links(self) -> None:
        context = build_notification_sample_context(
            channel="email",
            recipient="admin@example.com",
            public_base_url="https://portal.customer.example.com/workbench",
        )

        self.assertEqual(context["action_link"], "https://portal.customer.example.com/workbench")
        self.assertEqual(context["reset_link"], "https://portal.customer.example.com/workbench/reset-password")
        self.assertEqual(context["log_link"], "https://portal.customer.example.com/workbench/admin/logs")

    def test_resolve_notification_template_id_from_config_map(self) -> None:
        config_map = {"notification_sms_template_id": "12"}
        self.assertEqual(resolve_notification_template_id_from_config_map(config_map, "sms"), 12)
        self.assertIsNone(resolve_notification_template_id_from_config_map({}, "sms"))

    def test_analyze_notification_template_definition_detects_missing_and_invalid_variables(self) -> None:
        analysis = analyze_notification_template_definition(
            category="email",
            subject="Hello {{user_name}}",
            content="Reset at {{reset_time}} via {{action_link}}",
            declared_variables=["user_name", "reset time", "unused_value"],
            subject_i18n={"zh-CN": "您好 {{user_name }}"},
            content_i18n={"zh-CN": "请于 {{reset_time}} 前处理 {{action_link}}"},
        )

        self.assertEqual(analysis["placeholder_variables"], ["user_name", "reset_time", "action_link"])
        self.assertEqual(analysis["invalid_declared_variables"], ["reset time"])
        self.assertEqual(analysis["missing_declared_variables"], ["reset_time", "action_link"])
        self.assertEqual(analysis["unused_declared_variables"], ["reset time", "unused_value"])

    def test_i18n_helpers_normalize_and_fallback(self) -> None:
        self.assertEqual(
            normalize_notification_template_i18n_map({"zh_CN": "中文", "en-US": "English", "fr-FR": "ignore"}),
            {"zh-CN": "中文", "en-US": "English"},
        )
        self.assertEqual(
            get_localized_notification_template_text("Default", {"zh-CN": "中文"}, locale="zh-CN"),
            "中文",
        )
        self.assertEqual(
            get_localized_notification_template_text("Default", {"zh-CN": "中文"}, locale="en-US"),
            "Default",
        )

    def test_build_branded_email_html_wraps_content(self) -> None:
        html = build_branded_email_html(
            subject="Welcome",
            body_html="<p>Hello world</p>",
            branding={
                "app_name": "ACME Portal",
                "footer_text": "ACME Footer",
                "logo_url": "https://cdn.example.com/logo.png",
                "public_base_url": "https://portal.example.com",
            },
        )

        self.assertIn("Welcome", html)
        self.assertIn("ACME Portal", html)
        self.assertIn("ACME Footer", html)
        self.assertIn("https://cdn.example.com/logo.png", html)

    def test_get_notification_email_branding_rewrites_public_logo_url(self) -> None:
        async def _run() -> dict[str, str]:
            class DummyResult:
                def scalars(self):
                    return self

                def all(self):
                    return [
                        SimpleNamespace(key="app_name", value="ACME Portal"),
                        SimpleNamespace(key="logo_url", value="/api/v1/files/logo-token"),
                        SimpleNamespace(key="footer_text", value="Footer"),
                        SimpleNamespace(key="platform_public_base_url", value="https://portal.example.com"),
                    ]

            class DummyDB:
                async def execute(self, _query):
                    return DummyResult()

            return await get_notification_email_branding(DummyDB())

        with patch.dict(os.environ, {"PORTAL_PUBLIC_BASE_URL": "", "PUBLIC_BASE_URL": ""}, clear=False):
            branding = asyncio.run(_run())
        self.assertEqual(branding["app_name"], "ACME Portal")
        self.assertEqual(branding["footer_text"], "Footer")
        self.assertEqual(
            branding["logo_url"],
            "https://portal.example.com/api/v1/public/files/logo-token",
        )


if __name__ == "__main__":
    unittest.main()
