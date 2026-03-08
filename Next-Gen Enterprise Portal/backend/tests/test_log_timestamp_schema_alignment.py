from __future__ import annotations

import re
from pathlib import Path
from unittest import TestCase


BACKEND_ROOT = Path(__file__).resolve().parent.parent
BASELINE_MIGRATION = BACKEND_ROOT / "db_migrations" / "versions" / "20260305_0001_baseline_schema.py"


class LogTimestampSchemaAlignmentTests(TestCase):
    def test_baseline_schema_uses_timestamptz_for_log_timestamps(self):
        content = BASELINE_MIGRATION.read_text(encoding="utf-8")

        self.assertRegex(
            content,
            r"CREATE TABLE IF NOT EXISTS business_logs.*timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW\(\)",
        )
        self.assertRegex(
            content,
            r"CREATE TABLE IF NOT EXISTS system_logs.*timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW\(\)",
        )
        self.assertNotRegex(content, r"CREATE TABLE IF NOT EXISTS business_logs.*timestamp VARCHAR")
        self.assertNotRegex(content, r"CREATE TABLE IF NOT EXISTS system_logs.*timestamp VARCHAR")
