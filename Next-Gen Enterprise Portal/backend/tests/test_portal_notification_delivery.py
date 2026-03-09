from __future__ import annotations

import unittest
from types import SimpleNamespace

from modules.portal.services.notifications import build_recipient_notifications


class PortalNotificationDeliveryTests(unittest.TestCase):
    def test_build_recipient_notifications_renders_per_recipient_locale(self) -> None:
        template = SimpleNamespace(
            id=12,
            code="im_welcome",
            name="Welcome Notice",
            name_i18n={"zh-CN": "欢迎通知"},
            category="im",
            subject="",
            subject_i18n={},
            content="Hello {{user_name}}",
            content_i18n={"zh-CN": "您好 {{user_name}}"},
            variables=["user_name"],
        )
        recipients = [
            SimpleNamespace(id=101, locale="zh-CN"),
            SimpleNamespace(id=102, locale="en-US"),
        ]

        notifications = build_recipient_notifications(
            recipients=recipients,
            created_by=1,
            notification_type="info",
            action_url="https://portal.example.com/tasks",
            base_title="",
            base_message="",
            template=template,
            template_context={"user_name": "Alice"},
        )

        self.assertEqual(len(notifications), 2)
        self.assertEqual(notifications[0].title, "欢迎通知")
        self.assertEqual(notifications[0].message, "您好 Alice")
        self.assertEqual(notifications[0].receipts[0].user_id, 101)

        self.assertEqual(notifications[1].title, "Welcome Notice")
        self.assertEqual(notifications[1].message, "Hello Alice")
        self.assertEqual(notifications[1].receipts[0].user_id, 102)


if __name__ == "__main__":
    unittest.main()
