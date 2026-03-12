from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

from sqlalchemy import BigInteger


BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from iam.audit.models import IAMAuditLog
from modules.models import AIAuditLog, BusinessLog, KBChunk, KBQueryLog, NotificationReceipt, SystemLog


class HighVolumeLogPrimaryKeyTypeTests(TestCase):
    def test_high_volume_tables_use_bigint_primary_keys(self):
        for model in (
            SystemLog,
            BusinessLog,
            AIAuditLog,
            NotificationReceipt,
            KBChunk,
            KBQueryLog,
            IAMAuditLog,
        ):
            with self.subTest(model=model.__name__):
                self.assertIsInstance(model.__table__.c.id.type, BigInteger)
