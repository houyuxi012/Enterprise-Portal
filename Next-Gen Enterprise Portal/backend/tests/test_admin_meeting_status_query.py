from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.admin.routers.meetings import _meeting_end_time_expression, _meeting_status_condition


class AdminMeetingStatusQueryTests(TestCase):
    def test_upcoming_status_condition_compiles_for_summary_query(self):
        statement = select(_meeting_status_condition("upcoming"))
        compiled = str(statement.compile(dialect=postgresql.dialect()))

        self.assertIn("start_time > now()", compiled)
        self.assertNotIn("make_interval", compiled)

    def test_in_progress_status_condition_uses_positional_make_interval(self):
        statement = select(_meeting_status_condition("inProgress"))
        compiled = str(statement.compile(dialect=postgresql.dialect()))

        self.assertIn("make_interval", compiled)

    def test_end_time_expression_builds_without_keyword_args(self):
        statement = select(_meeting_end_time_expression())
        compiled = str(statement.compile(dialect=postgresql.dialect()))

        self.assertIn("make_interval", compiled)
