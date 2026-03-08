#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import render_runtime_secrets
import secretctl

DEFAULT_ROTATE_KEYS = (
    "postgres_password",
    "redis_password",
    "jwt_secret",
    "minio_root_user",
    "minio_root_password",
    "grafana_admin_password",
    "bind_password_enc_keys",
    "bind_password_enc_active_kid",
)


def _random_token(length: int = 32) -> str:
    raw = os.urandom(length)
    return secretctl._b64url_encode(raw)


def _build_bind_password_keyring() -> tuple[str, str]:
    kid = datetime.now(UTC).strftime("k%Y%m%d%H%M%S")
    key_json = json.dumps({kid: _random_token(32)}, separators=(",", ":"))
    return key_json, kid


def _decrypt_existing_values(secrets_file: Path) -> dict[str, str]:
    raw = secretctl.parse_simple_yaml(secrets_file) if secrets_file.exists() else {}
    resolved: dict[str, str] = {}
    for key, value in raw.items():
        resolved[key] = (
            secretctl.decode_encrypted_value(value)
            if str(value).startswith(secretctl.ENC_PREFIX)
            else str(value)
        )
    return resolved


def rotate_secrets(
    *,
    secrets_file: Path,
    output_dir: Path,
    rotate_keys: tuple[str, ...],
    render_runtime: bool,
) -> None:
    current = _decrypt_existing_values(secrets_file)

    bind_keyring_json, bind_active_kid = _build_bind_password_keyring()
    generated = {
        "postgres_password": _random_token(),
        "redis_password": _random_token(),
        "jwt_secret": _random_token(48),
        "minio_root_user": "portalroot",
        "minio_root_password": _random_token(),
        "grafana_admin_password": _random_token(),
        "bind_password_enc_keys": bind_keyring_json,
        "bind_password_enc_active_kid": bind_active_kid,
    }

    next_values = dict(current)
    for key in rotate_keys:
        if key not in generated:
            raise RuntimeError(f"Unsupported rotate target: {key}")
        next_values[key] = generated[key]

    encoded = {
        key: secretctl.encode_encrypted_value(value)
        for key, value in sorted(next_values.items())
    }

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    if secrets_file.exists():
        backup = secrets_file.with_suffix(secrets_file.suffix + f".bak.{timestamp}")
        shutil.copy2(secrets_file, backup)

    secretctl.dump_simple_yaml(secrets_file, encoded)

    if render_runtime:
        render_runtime_secrets.render_runtime_secrets(output_dir, secrets_file=secrets_file)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rotate-secrets")
    parser.add_argument(
        "--secrets-file",
        default=os.getenv("PORTAL_SECRETS_FILE") or str(secretctl.DEFAULT_SECRETS_FILE),
    )
    parser.add_argument(
        "--output-dir",
        default=os.getenv("PORTAL_RUNTIME_SECRETS_DIR") or "/run/secrets",
    )
    parser.add_argument(
        "--skip-render",
        action="store_true",
        help="Rotate secrets.enc.yaml but do not regenerate runtime secret files.",
    )
    parser.add_argument(
        "keys",
        nargs="*",
        help="Optional subset of keys to rotate.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    rotate_keys = tuple(args.keys) if args.keys else DEFAULT_ROTATE_KEYS
    rotate_secrets(
        secrets_file=Path(args.secrets_file),
        output_dir=Path(args.output_dir),
        rotate_keys=rotate_keys,
        render_runtime=not args.skip_render,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"rotate-secrets: {exc}", file=sys.stderr)
        raise SystemExit(1)
