"""Shared fixtures for backend tests."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Minimal in-memory model stubs (no real DB)
# ---------------------------------------------------------------------------

class FakeUser:
    """Minimal stand-in for models.User used in unit tests."""
    def __init__(self, **kw):
        self.id = kw.get("id", 1)
        self.username = kw.get("username", "testuser")
        self.email = kw.get("email", "test@test.local")
        self.name = kw.get("name", "Test User")
        self.avatar = kw.get("avatar")
        self.directory_id = kw.get("directory_id")
        self.external_id = kw.get("external_id")
        self.pending_delete_at = kw.get("pending_delete_at")
        self.account_type = kw.get("account_type", "PORTAL")
        self.is_active = True
        self.roles = []


class FakeEmployee:
    """Minimal stand-in for models.Employee."""
    def __init__(self, **kw):
        self.id = kw.get("id", 1)
        self.account = kw.get("account", "testuser")
        self.department = kw.get("department", "未分配")
        self.primary_department_id = kw.get("primary_department_id")
        self.avatar = kw.get("avatar")
        self.avatar_hash = kw.get("avatar_hash")
        self.status = "Active"


class FakeSyncJob:
    """Minimal stand-in for models.SyncJob."""
    def __init__(self, **kw):
        self.id = kw.get("id", 1)
        self.directory_id = kw.get("directory_id", 1)
        self.job_type = kw.get("job_type", "full")
        self.status = kw.get("status", "running")
        self.stage = kw.get("stage")
        self.checkpoint_data = kw.get("checkpoint_data")
        self.stats = kw.get("stats", {})
        self.cursor_start = kw.get("cursor_start")
        self.cursor_end = kw.get("cursor_end")
        self.max_usn_seen = kw.get("max_usn_seen")
        self.error_detail = kw.get("error_detail")
        self.started_at = datetime.now(timezone.utc)
        self.finished_at = None


class FakeDirectoryConfig:
    """Minimal stand-in for models.DirectoryConfig."""
    def __init__(self, **kw):
        self.id = kw.get("id", 1)
        self.name = kw.get("name", "TestLDAP")
        self.type = kw.get("type", "ldap")
        self.host = kw.get("host", "localhost")
        self.port = kw.get("port", 389)
        self.base_dn = kw.get("base_dn", "dc=example,dc=com")
        self.bind_dn = kw.get("bind_dn")
        self.use_ssl = False
        self.start_tls = False
        self.enabled = True
        self.sync_cursor = kw.get("sync_cursor")
        self.sync_page_size = kw.get("sync_page_size", 1000)
        self.delete_grace_days = kw.get("delete_grace_days", 7)
        self.delete_whitelist = kw.get("delete_whitelist")
        self.user_filter = "(objectClass=inetOrgPerson)"
        self.username_attr = "uid"
        self.email_attr = "mail"
        self.display_name_attr = "cn"
        self.mobile_attr = "mobile"
        self.avatar_attr = "jpegPhoto"
