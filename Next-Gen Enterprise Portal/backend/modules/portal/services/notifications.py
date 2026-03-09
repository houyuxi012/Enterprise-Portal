from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import modules.models as models
from modules.admin.services.notification_templates import (
    get_localized_notification_template_name,
    render_notification_template,
)


def build_recipient_notifications(
    *,
    recipients: Sequence[models.User],
    created_by: int | None,
    notification_type: str,
    action_url: str | None,
    base_title: str,
    base_message: str,
    template: models.NotificationTemplate | None = None,
    template_context: Mapping[str, Any] | None = None,
) -> list[models.Notification]:
    notifications: list[models.Notification] = []
    effective_context = {key: str(value) for key, value in (template_context or {}).items()}

    for recipient in recipients:
        notification_title = base_title.strip()
        notification_message = base_message.strip()
        if template is not None:
            rendered = render_notification_template(
                template,
                effective_context,
                locale=getattr(recipient, "locale", None),
            )
            notification_message = str(rendered["content"] or "").strip()
            if not notification_title:
                notification_title = get_localized_notification_template_name(
                    template,
                    locale=getattr(recipient, "locale", None),
                ).strip()

        if not notification_title:
            raise ValueError("通知标题不能为空")
        if not notification_message:
            raise ValueError("通知内容不能为空")

        notification = models.Notification(
            title=notification_title,
            message=notification_message,
            type=notification_type,
            action_url=action_url,
            created_by=created_by,
        )
        notification.receipts.append(
            models.NotificationReceipt(
                user_id=recipient.id,
            )
        )
        notifications.append(notification)

    return notifications
