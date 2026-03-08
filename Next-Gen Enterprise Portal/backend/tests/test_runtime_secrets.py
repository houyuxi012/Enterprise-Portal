from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core import runtime_secrets


class RuntimeSecretsTests(TestCase):
    def setUp(self) -> None:
        runtime_secrets._BOOTSTRAPPED = False

    def tearDown(self) -> None:
        runtime_secrets._BOOTSTRAPPED = False

    def test_bootstrap_process_secrets_loads_file_backed_env(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            secret_file = Path(tmp_dir) / "jwt_secret"
            secret_file.write_text("file-backed-secret\n", encoding="utf-8")

            with patch.dict(
                os.environ,
                {
                    "SECRET_KEY_FILE": str(secret_file),
                },
                clear=True,
            ):
                runtime_secrets._BOOTSTRAPPED = False
                runtime_secrets.bootstrap_process_secrets()
                self.assertEqual(os.getenv("SECRET_KEY"), "file-backed-secret")

    def test_get_required_env_raises_when_secret_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            runtime_secrets._BOOTSTRAPPED = False
            with self.assertRaises(RuntimeError):
                runtime_secrets.get_required_env("MASTER_KEY")

    def test_validate_required_envs_accepts_file_backed_secret(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            secret_file = Path(tmp_dir) / "jwt_secret"
            secret_file.write_text("jwt-secret-from-file\n", encoding="utf-8")

            with patch.dict(
                os.environ,
                {
                    "SECRET_KEY_FILE": str(secret_file),
                },
                clear=True,
            ):
                runtime_secrets._BOOTSTRAPPED = False
                runtime_secrets.validate_required_envs(["SECRET_KEY"])
                self.assertEqual(runtime_secrets.get_required_env("SECRET_KEY"), "jwt-secret-from-file")
