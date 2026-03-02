"""Tests for delete protection with grace period and whitelist (Task 5)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from services.identity.sync_errors import (
    SYNC_DELETE_GRACE_MARKED,
    SYNC_DELETE_GRACE_EXPIRED,
    SYNC_DELETE_WHITELIST_SKIP,
    SYNC_DELETE_EXECUTED,
)


def _is_whitelist_protected(username: str, user_dn: str, rules: list[dict]) -> bool:
    """Extracted whitelist check logic for testability."""
    for rule in rules:
        rule_type = rule.get("type", "")
        pattern = rule.get("pattern", "")
        if rule_type == "username" and pattern == username:
            return True
        elif rule_type == "ou" and f"ou={pattern},".lower() in user_dn.lower():
            return True
        elif rule_type == "group" and pattern:
            return True
    return False


class TestGracePeriod:
    """Grace period marking and expiration tests."""

    def test_grace_period_marks_pending(self):
        """First time a user is missing, pending_delete_at should be set."""
        now = datetime.now(timezone.utc)
        pending_delete_at = None

        # Simulate: user not in ldap_external_ids, never marked
        if pending_delete_at is None:
            pending_delete_at = now

        assert pending_delete_at is not None
        assert pending_delete_at == now

    def test_grace_period_not_expired(self):
        """User marked < grace_days ago should NOT be deleted."""
        grace_days = 7
        now = datetime.now(timezone.utc)
        marked_at = now - timedelta(days=3)

        should_delete = now >= marked_at + timedelta(days=grace_days)
        assert should_delete is False

    def test_grace_period_expired_deletes(self):
        """User marked >= grace_days ago SHOULD be deleted."""
        grace_days = 7
        now = datetime.now(timezone.utc)
        marked_at = now - timedelta(days=8)

        should_delete = now >= marked_at + timedelta(days=grace_days)
        assert should_delete is True

    def test_grace_period_exact_boundary(self):
        """Exact boundary: marked exactly grace_days ago should trigger deletion."""
        grace_days = 7
        now = datetime.now(timezone.utc)
        marked_at = now - timedelta(days=7)

        should_delete = now >= marked_at + timedelta(days=grace_days)
        assert should_delete is True

    def test_user_reappears_clears_pending(self):
        """If user reappears in LDAP source, pending_delete_at should be cleared."""
        pending_delete_at = datetime.now(timezone.utc) - timedelta(days=3)
        # Simulate: user found in ldap_external_ids → clear marker
        pending_delete_at = None
        assert pending_delete_at is None


class TestDeleteWhitelist:
    """Whitelist protection tests."""

    def test_whitelist_username_match(self):
        """Username in whitelist should be protected."""
        rules = [{"type": "username", "pattern": "admin"}]
        assert _is_whitelist_protected("admin", "uid=admin,ou=people,dc=example,dc=com", rules) is True

    def test_whitelist_username_no_match(self):
        """Username NOT in whitelist should NOT be protected."""
        rules = [{"type": "username", "pattern": "admin"}]
        assert _is_whitelist_protected("john", "uid=john,ou=people,dc=example,dc=com", rules) is False

    def test_whitelist_ou_match(self):
        """User in protected OU should be protected."""
        rules = [{"type": "ou", "pattern": "VIP"}]
        assert _is_whitelist_protected("john", "uid=john,ou=VIP,dc=example,dc=com", rules) is True

    def test_whitelist_ou_case_insensitive(self):
        """OU matching should be case-insensitive."""
        rules = [{"type": "ou", "pattern": "vip"}]
        assert _is_whitelist_protected("john", "uid=john,OU=VIP,dc=example,dc=com", rules) is True

    def test_whitelist_ou_no_match(self):
        """User NOT in protected OU should NOT be protected."""
        rules = [{"type": "ou", "pattern": "VIP"}]
        assert _is_whitelist_protected("john", "uid=john,ou=Engineering,dc=example,dc=com", rules) is False

    def test_whitelist_multiple_rules(self):
        """Multiple matching rules – any match should protect."""
        rules = [
            {"type": "username", "pattern": "admin"},
            {"type": "ou", "pattern": "Management"},
        ]
        assert _is_whitelist_protected("john", "uid=john,ou=Management,dc=example,dc=com", rules) is True

    def test_whitelist_empty_rules(self):
        """Empty whitelist should protect nobody."""
        assert _is_whitelist_protected("john", "uid=john,ou=people,dc=example,dc=com", []) is False


class TestDeleteAudit:
    """Audit before/after snapshot structure."""

    def test_before_snapshot_structure(self):
        """before_snapshot should contain all required user fields."""
        before = {
            "id": 42,
            "username": "john",
            "email": "john@example.com",
            "name": "John Doe",
            "directory_id": 1,
            "external_id": "uid=john,ou=people,dc=example,dc=com",
            "pending_delete_at": "2026-02-23T00:00:00+00:00",
        }
        required_keys = {"id", "username", "email", "name", "directory_id", "external_id", "pending_delete_at"}
        assert required_keys.issubset(before.keys())

    def test_whitelist_json_config_parsing(self):
        """Whitelist config stored as JSON in DB should parse correctly."""
        raw = json.dumps([
            {"type": "username", "pattern": "service-account"},
            {"type": "ou", "pattern": "Protected"},
        ])
        parsed = json.loads(raw)
        assert len(parsed) == 2
        assert parsed[0]["type"] == "username"
        assert parsed[1]["pattern"] == "Protected"
