from __future__ import annotations

import re
import sys
from pathlib import Path
from unittest import TestCase


BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import String, Text

from modules.admin.models import (
    AIAuditLog,
    AIModelQuota,
    AIProvider,
    AISecurityPolicy,
    AdminMeeting,
    AdminMeetingAttendee,
    BusinessLog,
    Department,
    LogForwardingConfig,
    SystemLog,
)
from modules.iam.models import (
    DirectoryConfig,
    LicenseEvent,
    LicenseState,
    Permission,
    PrivacyConsent,
    Role,
    SyncJob,
    SystemConfig,
    User,
    UserPasswordHistory,
    WebAuthnCredential,
)
from modules.portal.models import (
    Announcement,
    AnnouncementRead,
    CarouselItem,
    Employee,
    FileMetadata,
    KBChunk,
    KBDocument,
    NewsItem,
    Notification,
    NotificationReceipt,
    QuickTool,
    Todo,
)


class DatetimeAndStringConstraintTests(TestCase):
    def _assert_utc_now_callable(self, callback) -> None:
        self.assertIsNotNone(callback)
        self.assertEqual(getattr(callback, "__name__", None), "utc_now")
        self.assertEqual(getattr(callback, "__module__", None), "core.time_utils")

    def test_backend_code_no_longer_uses_utcnow(self):
        utcnow_pattern = re.compile(r"datetime(?:\\.datetime)?\\.utcnow\\b")
        offenders: list[str] = []
        for path in BACKEND_ROOT.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            if utcnow_pattern.search(path.read_text(encoding="utf-8")):
                offenders.append(str(path))
        self.assertEqual(offenders, [])

    def test_datetime_defaults_use_shared_utc_callable(self):
        default_targets = (
            User.__table__.c.password_changed_at,
            WebAuthnCredential.__table__.c.created_at,
            UserPasswordHistory.__table__.c.changed_at,
            DirectoryConfig.__table__.c.created_at,
            DirectoryConfig.__table__.c.updated_at,
            SyncJob.__table__.c.started_at,
            PrivacyConsent.__table__.c.accepted_at,
            LicenseState.__table__.c.installed_at,
            LicenseState.__table__.c.updated_at,
            LicenseEvent.__table__.c.created_at,
            SystemLog.__table__.c.timestamp,
            BusinessLog.__table__.c.timestamp,
            AdminMeeting.__table__.c.created_at,
            AdminMeeting.__table__.c.updated_at,
            AdminMeetingAttendee.__table__.c.created_at,
            Announcement.__table__.c.created_at,
            AnnouncementRead.__table__.c.read_at,
            Notification.__table__.c.created_at,
            NotificationReceipt.__table__.c.created_at,
            Todo.__table__.c.created_at,
            Todo.__table__.c.updated_at,
        )
        for column in default_targets:
            with self.subTest(column=column.name):
                self.assertIsNotNone(column.default)
                self._assert_utc_now_callable(column.default.arg)

        onupdate_targets = (
            DirectoryConfig.__table__.c.updated_at,
            LicenseState.__table__.c.updated_at,
            AdminMeeting.__table__.c.updated_at,
            Todo.__table__.c.updated_at,
        )
        for column in onupdate_targets:
            with self.subTest(onupdate=column.name):
                self.assertIsNotNone(column.onupdate)
                self._assert_utc_now_callable(column.onupdate.arg)

    def test_identity_and_personnel_strings_are_bounded(self):
        expected_lengths = {
            (Department, "name"): 128,
            (Department, "manager"): 128,
            (Department, "description"): 255,
            (Permission, "code"): 128,
            (Permission, "description"): 255,
            (Role, "code"): 128,
            (Role, "name"): 128,
            (Role, "description"): 255,
            (SystemConfig, "key"): 128,
            (User, "username"): 128,
            (User, "email"): 255,
            (User, "hashed_password"): 255,
            (User, "name"): 255,
            (User, "avatar"): 512,
            (Employee, "account"): 128,
            (Employee, "job_number"): 64,
            (Employee, "name"): 128,
            (Employee, "gender"): 16,
            (Employee, "department"): 128,
            (Employee, "role"): 128,
            (Employee, "email"): 255,
            (Employee, "phone"): 32,
            (Employee, "location"): 255,
            (Employee, "avatar"): 512,
            (Employee, "status"): 32,
            (SystemLog, "level"): 20,
            (SystemLog, "module"): 100,
            (SystemLog, "ip_address"): 45,
            (SystemLog, "request_path"): 2048,
            (SystemLog, "method"): 16,
            (SystemLog, "user_agent"): 512,
            (BusinessLog, "operator"): 255,
            (BusinessLog, "action"): 128,
            (BusinessLog, "target"): 255,
            (BusinessLog, "ip_address"): 45,
            (BusinessLog, "status"): 20,
            (BusinessLog, "trace_id"): 128,
            (BusinessLog, "source"): 32,
            (BusinessLog, "domain"): 32,
            (LogForwardingConfig, "type"): 32,
            (LogForwardingConfig, "endpoint"): 1024,
            (AIProvider, "name"): 128,
            (AIProvider, "type"): 32,
            (AIProvider, "model_kind"): 32,
            (AIProvider, "base_url"): 1024,
            (AIProvider, "model"): 128,
            (AISecurityPolicy, "name"): 128,
            (AISecurityPolicy, "type"): 32,
            (AISecurityPolicy, "action"): 32,
            (AIModelQuota, "model_name"): 128,
            (NewsItem, "title"): 255,
            (NewsItem, "category"): 64,
            (NewsItem, "author"): 128,
            (NewsItem, "image"): 512,
            (QuickTool, "name"): 128,
            (QuickTool, "icon_name"): 64,
            (QuickTool, "url"): 1024,
            (QuickTool, "color"): 32,
            (QuickTool, "category"): 64,
            (QuickTool, "description"): 255,
            (QuickTool, "image"): 512,
            (Announcement, "tag"): 64,
            (Announcement, "title"): 255,
            (Announcement, "time"): 64,
            (Announcement, "color"): 32,
            (Notification, "title"): 255,
            (Notification, "action_url"): 1024,
            (CarouselItem, "title"): 255,
            (CarouselItem, "image"): 512,
            (CarouselItem, "url"): 1024,
            (CarouselItem, "badge"): 64,
            (FileMetadata, "original_name"): 255,
            (FileMetadata, "stored_name"): 255,
            (FileMetadata, "bucket"): 128,
            (FileMetadata, "content_type"): 255,
            (KBDocument, "title"): 255,
            (KBChunk, "section"): 255,
            (Todo, "title"): 255,
            (Todo, "status"): 32,
        }
        for (model, column_name), expected_length in expected_lengths.items():
            with self.subTest(model=model.__name__, column=column_name):
                self.assertEqual(model.__table__.c[column_name].type.length, expected_length)

    def test_text_columns_are_explicitly_text(self):
        text_columns = (
            (SystemConfig, "value"),
            (LogForwardingConfig, "secret_token"),
            (LogForwardingConfig, "log_types"),
            (AIProvider, "api_key"),
        )
        for model, column_name in text_columns:
            with self.subTest(model=model.__name__, column=column_name):
                self.assertIsInstance(model.__table__.c[column_name].type, Text)

    def test_core_models_do_not_use_unbounded_string_columns(self):
        model_classes = (
            Permission,
            Role,
            User,
            WebAuthnCredential,
            UserPasswordHistory,
            DirectoryConfig,
            SystemConfig,
            PrivacyConsent,
            LicenseState,
            LicenseEvent,
            Department,
            SystemLog,
            BusinessLog,
            LogForwardingConfig,
            AdminMeeting,
            AIAuditLog,
            AIProvider,
            AISecurityPolicy,
            AIModelQuota,
            Employee,
            NewsItem,
            QuickTool,
            Announcement,
            Notification,
            CarouselItem,
            FileMetadata,
            KBDocument,
            KBChunk,
            Todo,
        )
        offenders: list[str] = []
        for model in model_classes:
            for column in model.__table__.columns:
                if isinstance(column.type, Text):
                    continue
                if isinstance(column.type, String) and column.type.length is None:
                    offenders.append(f"{model.__name__}.{column.name}")
        self.assertEqual(offenders, [])
