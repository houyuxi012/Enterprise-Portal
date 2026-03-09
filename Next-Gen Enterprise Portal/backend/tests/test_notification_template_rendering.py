from __future__ import annotations

import json
import unittest
from types import SimpleNamespace

from modules.admin.services.notification_templates import (
    analyze_notification_template_definition,
    build_notification_sample_context,
    build_sms_test_payload,
    extract_notification_template_variables,
    get_localized_notification_template_text,
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


if __name__ == "__main__":
    unittest.main()
