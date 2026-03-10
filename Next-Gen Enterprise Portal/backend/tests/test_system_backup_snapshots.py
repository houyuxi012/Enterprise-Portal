from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase

from fastapi import HTTPException

from modules.admin.routers import system as system_router


class SystemBackupSnapshotHelperTests(TestCase):
    def test_build_backup_entry_reads_snapshot_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            backup_file = Path(tmp_dir) / 'portal-config-backup-20260310-000000-abcd1234.json'
            backup_file.write_text(
                json.dumps(
                    {
                        'backup_kind': system_router.BACKUP_SNAPSHOT_KIND,
                        'created_at': '2026-03-10T10:00:00+00:00',
                        'target_type': 'network',
                        'version_info': {
                            'version': '1.1.0-beta.1',
                            'db_schema_version': '20260310_0022',
                        },
                        'system_config': {
                            'platform_public_base_url': 'https://portal.example.com',
                        },
                    }
                ),
                encoding='utf-8',
            )

            entry = system_router._build_backup_entry(backup_file)

        self.assertEqual(entry['name'], backup_file.name)
        self.assertEqual(entry['target_type'], 'network')
        self.assertEqual(entry['version'], '1.1.0-beta.1')
        self.assertEqual(entry['schema_version'], '20260310_0022')
        self.assertTrue(entry['restorable'])

    def test_resolve_backup_file_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            backup_root = Path(tmp_dir)
            with self.assertRaises(HTTPException) as ctx:
                system_router._resolve_backup_file(backup_root, '../escape.json')

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail['code'], 'BACKUP_NAME_INVALID')

    def test_require_backup_root_rejects_missing_path(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            system_router._require_backup_root({}, create=False)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail['code'], 'BACKUP_PATH_REQUIRED')

    def test_build_backup_preview_masks_sensitive_values_and_skips_unchanged(self) -> None:
        preview = system_router._build_backup_preview(
            backup_entry={'name': 'portal-config-backup.json'},
            snapshot_items={
                'smtp_password': 'fernet:v1:encrypted-new',
                'platform_public_base_url': 'https://portal.example.com',
            },
            current_items={
                'smtp_password': 'fernet:v1:encrypted-old',
                'platform_public_base_url': 'https://portal.example.com',
            },
        )

        self.assertEqual(preview['summary']['create_count'], 0)
        self.assertEqual(preview['summary']['update_count'], 1)
        self.assertEqual(preview['summary']['unchanged_count'], 1)
        self.assertEqual(len(preview['diffs']), 1)
        self.assertEqual(preview['diffs'][0]['key'], 'smtp_password')
        self.assertEqual(preview['diffs'][0]['status'], 'update')
        self.assertTrue(preview['diffs'][0]['sensitive'])
        self.assertEqual(preview['diffs'][0]['current_value'], '__MASKED__')
        self.assertEqual(preview['diffs'][0]['backup_value'], '__MASKED__')
