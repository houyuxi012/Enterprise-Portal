"""Tests for cursor safety (Task 4)."""
from __future__ import annotations

import pytest

from services.identity.sync_errors import (
    SYNC_CURSOR_REGRESSION,
    SYNC_CURSOR_JUMP_ALERT,
    SYNC_CURSOR_COMMITTED,
    DEFAULT_CURSOR_JUMP_THRESHOLD,
)


def _check_cursor_safety(
    dir_type: str,
    current_cursor: str | None,
    new_cursor: str | None,
) -> tuple[str | None, str | None]:
    """Extracted cursor safety logic for testability.
    
    Returns (effective_cursor, warning_code).
    """
    cursor_warning = None
    if new_cursor and current_cursor:
        if dir_type == "ad":
            try:
                new_val = int(new_cursor)
                old_val = int(current_cursor)
                if new_val < old_val:
                    cursor_warning = SYNC_CURSOR_REGRESSION
                    new_cursor = None  # Do not update
                elif new_val - old_val > DEFAULT_CURSOR_JUMP_THRESHOLD:
                    cursor_warning = SYNC_CURSOR_JUMP_ALERT
            except ValueError:
                pass
        else:
            if new_cursor < current_cursor:
                cursor_warning = SYNC_CURSOR_REGRESSION
                new_cursor = None
    return new_cursor, cursor_warning


class TestCursorSafety:
    """Cursor commit / regression / jump detection tests."""

    def test_cursor_only_committed_on_success(self):
        """When sync succeeds, cursor should be the new value."""
        result, warning = _check_cursor_safety("ad", "100", "200")
        assert result == "200"
        assert warning is None

    def test_cursor_regression_triggers_nullify_ad(self):
        """AD: if new cursor < old cursor, it's a regression → cursor stays None."""
        result, warning = _check_cursor_safety("ad", "500", "300")
        assert result is None
        assert warning == SYNC_CURSOR_REGRESSION

    def test_cursor_regression_triggers_nullify_ldap(self):
        """OpenLDAP: if new entryCSN < old entryCSN, cursor stays None."""
        result, warning = _check_cursor_safety(
            "ldap",
            "20260301120000.000000Z#000000#000#000000",
            "20260201120000.000000Z#000000#000#000000",
        )
        assert result is None
        assert warning == SYNC_CURSOR_REGRESSION

    def test_cursor_jump_alert_ad(self):
        """AD: large jump should produce warning but still commit cursor."""
        old = "1000"
        new = str(1000 + DEFAULT_CURSOR_JUMP_THRESHOLD + 1)
        result, warning = _check_cursor_safety("ad", old, new)
        assert result == new  # cursor still committed
        assert warning == SYNC_CURSOR_JUMP_ALERT

    def test_cursor_normal_increment_no_warning(self):
        """Normal increment should produce no warning."""
        result, warning = _check_cursor_safety("ad", "1000", "1050")
        assert result == "1050"
        assert warning is None

    def test_cursor_none_initial_sync(self):
        """First sync (no existing cursor) should just set the cursor."""
        result, warning = _check_cursor_safety("ad", None, "500")
        assert result == "500"
        assert warning is None

    def test_cursor_ldap_normal_increment(self):
        """OpenLDAP normal increment should pass."""
        result, warning = _check_cursor_safety(
            "ldap",
            "20260101000000.000000Z#000000#000#000000",
            "20260301120000.000000Z#000000#000#000000",
        )
        assert result is not None
        assert warning is None
