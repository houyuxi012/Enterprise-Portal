from __future__ import annotations

import importlib.util
import os
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch


def _load_module(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


SCRIPT_ROOT = Path(__file__).resolve().parent.parent / "scripts"
secretctl = _load_module("secretctl_module", SCRIPT_ROOT / "secretctl.py")
render_runtime_secrets = _load_module(
    "render_runtime_secrets_module",
    SCRIPT_ROOT / "render_runtime_secrets.py",
)
rotate_secrets = _load_module(
    "rotate_secrets_module",
    SCRIPT_ROOT / "rotate_secrets.py",
)


class LocalSecretManagerTests(TestCase):
    def test_secretctl_round_trip_uses_aes_gcm_envelope(self):
        master_key = bytes(range(32))
        with patch.object(secretctl, "load_master_key", return_value=master_key):
            ciphertext = secretctl.encode_encrypted_value("portal-secret")
            self.assertTrue(ciphertext.startswith("ENC(v1:"))
            plain = secretctl.decode_encrypted_value(ciphertext)
        self.assertEqual(plain, "portal-secret")

    def test_secretctl_uses_tpm2_when_keyring_is_empty(self):
        with (
            patch.object(secretctl, "_keyctl_search", side_effect=[None, "42"]),
            patch.object(secretctl, "_unseal_from_tpm2", return_value=b"\x01" * 32),
            patch.object(secretctl, "_keyctl_add") as add_key,
            patch.object(secretctl, "_keyctl_pipe", return_value=b"\x02" * 32),
        ):
            loaded = secretctl.load_master_key()

        add_key.assert_called_once_with(b"\x01" * 32)
        self.assertEqual(loaded, b"\x02" * 32)

    def test_render_runtime_secrets_writes_compose_secret_files(self):
        master_key = bytes(range(32))
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            secrets_file = tmp_path / "secrets.enc.yaml"
            output_dir = tmp_path / "runtime"

            with (
                patch.object(secretctl, "load_master_key", return_value=master_key),
                patch.object(render_runtime_secrets.secretctl, "load_master_key", return_value=master_key),
            ):
                encoded = {
                    "postgres_password": secretctl.encode_encrypted_value("pg-pass"),
                    "redis_password": secretctl.encode_encrypted_value("redis-pass"),
                    "jwt_secret": secretctl.encode_encrypted_value("jwt-pass"),
                    "bind_password_enc_keys": secretctl.encode_encrypted_value('{"kid1":"abcd"}'),
                    "bind_password_enc_active_kid": secretctl.encode_encrypted_value("kid1"),
                    "minio_root_user": secretctl.encode_encrypted_value("portalroot"),
                    "minio_root_password": secretctl.encode_encrypted_value("minio-pass"),
                    "grafana_admin_password": secretctl.encode_encrypted_value("grafana-pass"),
                }
                secretctl.dump_simple_yaml(secrets_file, encoded)

                with patch.dict(
                    os.environ,
                    {
                        "POSTGRES_USER": "portal",
                        "POSTGRES_DB": "portal_db",
                        "MINIO_BUCKET_NAME": "portal-bucket",
                    },
                    clear=False,
                ):
                    render_runtime_secrets.render_runtime_secrets(output_dir, secrets_file=secrets_file)

            self.assertEqual((output_dir / "postgres_password").read_text(encoding="utf-8"), "pg-pass")
            self.assertEqual((output_dir / "redis_password").read_text(encoding="utf-8"), "redis-pass")
            self.assertEqual((output_dir / "jwt_secret").read_text(encoding="utf-8"), "jwt-pass")
            self.assertEqual((output_dir / "master_key").read_text(encoding="utf-8"), secretctl._b64url_encode(master_key))
            self.assertIn("pg-pass", (output_dir / "backend_database_url").read_text(encoding="utf-8"))
            self.assertIn("redis-pass", (output_dir / "backend_redis_url").read_text(encoding="utf-8"))

    def test_rotate_secrets_creates_encrypted_source_of_truth_from_empty_state(self):
        master_key = bytes(range(32))
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            secrets_file = tmp_path / "secrets.enc.yaml"
            output_dir = tmp_path / "runtime"

            with (
                patch.object(secretctl, "load_master_key", return_value=master_key),
                patch.object(render_runtime_secrets.secretctl, "load_master_key", return_value=master_key),
                patch.object(rotate_secrets.secretctl, "load_master_key", return_value=master_key),
                patch.dict(
                    os.environ,
                    {
                        "POSTGRES_USER": "portal",
                        "POSTGRES_DB": "portal_db",
                        "MINIO_BUCKET_NAME": "portal-bucket",
                    },
                    clear=False,
                ),
            ):
                rotate_secrets.rotate_secrets(
                    secrets_file=secrets_file,
                    output_dir=output_dir,
                    rotate_keys=rotate_secrets.DEFAULT_ROTATE_KEYS,
                    render_runtime=True,
                )

            self.assertTrue(secrets_file.exists())
            self.assertIn("postgres_password:", secrets_file.read_text(encoding="utf-8"))
            self.assertTrue((output_dir / "backend_database_url").exists())
            self.assertTrue((output_dir / "bind_password_enc_keys").exists())
