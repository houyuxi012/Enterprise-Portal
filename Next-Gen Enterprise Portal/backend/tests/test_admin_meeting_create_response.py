from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.admin.routers import meetings as meetings_router
import modules.schemas as schemas


class _ScalarOneOrNoneResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self):
        self.added: list[object] = []
        self.commit = AsyncMock()
        self.refresh = AsyncMock(side_effect=self._refresh)
        self.execute = AsyncMock(return_value=_ScalarOneOrNoneResult(None))

    def add(self, item):
        self.added.append(item)

    async def _refresh(self, item):
        item.id = 42


class AdminMeetingCreateResponseTests(IsolatedAsyncioTestCase):
    async def test_create_admin_meeting_reloads_relations_before_serialize(self):
        db = _FakeDB()
        request = SimpleNamespace(
            headers={"X-Request-ID": "req-admin-meeting-create"},
            client=SimpleNamespace(host="127.0.0.1"),
        )
        current_user = SimpleNamespace(id=1, username="admin")
        organizer_user = SimpleNamespace(id=2, username="organizer", name="组织者")
        attendee_user = SimpleNamespace(id=3, username="attendee", name="参会人")
        loaded_meeting = SimpleNamespace(
            id=42,
            subject='项目周会',
            meeting_id='900-123-456',
            meeting_type='online',
        )
        payload = schemas.AdminMeetingCreate(
            subject="项目周会",
            start_time="2026-03-09T10:00:00+08:00",
            duration_minutes=60,
            meeting_type="online",
            meeting_room=None,
            meeting_software="腾讯会议",
            meeting_id="900-123-456",
            organizer_user_id=2,
            attendee_user_ids=[3],
        )

        with (
            patch.object(
                meetings_router,
                "_validate_payload",
                AsyncMock(return_value=(
                    "项目周会",
                    "900-123-456",
                    organizer_user,
                    None,
                    "腾讯会议",
                    [attendee_user],
                )),
            ),
            patch.object(meetings_router, "_fetch_meeting_or_404", AsyncMock(return_value=loaded_meeting)) as fetch_meeting,
            patch.object(meetings_router, "_serialize_admin_meeting", return_value={"id": 42}) as serialize_meeting,
            patch.object(meetings_router.AuditService, "schedule_business_action"),
        ):
            result = await meetings_router.create_admin_meeting(
                request=request,
                background_tasks=SimpleNamespace(),
                payload=payload,
                db=db,
                current_user=current_user,
            )

        self.assertEqual(result, {"id": 42})
        self.assertEqual(len(db.added), 1)
        fetch_meeting.assert_awaited_once_with(db, 42)
        serialize_meeting.assert_called_once_with(loaded_meeting)
