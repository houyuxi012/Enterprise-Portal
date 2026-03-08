#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import quote

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import secretctl


def _required_env(name: str) -> str:
    value = str(os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required when rendering runtime secrets.")
    return value


def _optional_secret(key: str, *, secrets_file: Path) -> str:
    values = secretctl.parse_simple_yaml(secrets_file)
    if key not in values:
        return ""
    value = values[key]
    return secretctl.decode_encrypted_value(value) if value.startswith(secretctl.ENC_PREFIX) else value


def _write_secret(directory: Path, name: str, value: str) -> None:
    target = directory / name
    target.write_text(value, encoding="utf-8")
    target.chmod(0o600)


def render_runtime_secrets(output_dir: Path, *, secrets_file: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    postgres_user = _required_env("POSTGRES_USER")
    postgres_db = _required_env("POSTGRES_DB")
    minio_bucket = _required_env("MINIO_BUCKET_NAME")
    redis_ca_cert = str(os.getenv("REDIS_SSL_CA_CERT") or "/run/certs/hyx_ngep.cer").strip()
    db_root_cert = str(os.getenv("DB_SSL_ROOT_CERT") or "/run/certs/hyx_ngep.cer").strip()
    minio_endpoint = str(os.getenv("MINIO_ENDPOINT_INTERNAL") or "minio:9000").strip()
    minio_secure = str(os.getenv("MINIO_SECURE") or "False").strip()

    postgres_password = secretctl.get_secret_value("postgres_password", secrets_file=secrets_file)
    redis_password = secretctl.get_secret_value("redis_password", secrets_file=secrets_file)
    jwt_secret = secretctl.get_secret_value("jwt_secret", secrets_file=secrets_file)
    bind_password_enc_keys = secretctl.get_secret_value("bind_password_enc_keys", secrets_file=secrets_file)
    bind_password_enc_active_kid = secretctl.get_secret_value(
        "bind_password_enc_active_kid",
        secrets_file=secrets_file,
    )
    minio_root_user = secretctl.get_secret_value("minio_root_user", secrets_file=secrets_file)
    minio_root_password = secretctl.get_secret_value("minio_root_password", secrets_file=secrets_file)
    grafana_admin_password = secretctl.get_secret_value("grafana_admin_password", secrets_file=secrets_file)

    master_key = secretctl.get_secret_value("master_key")
    master_key_previous = _optional_secret("master_key_previous", secrets_file=secrets_file)
    initial_admin_password = _optional_secret("initial_admin_password", secrets_file=secrets_file)

    backend_database_url = (
        f"postgresql+asyncpg://{quote(postgres_user)}:{quote(postgres_password)}@db:5432/{quote(postgres_db)}"
        f"?sslmode=verify-ca&sslrootcert={db_root_cert}"
    )
    backend_redis_url = (
        f"rediss://:{quote(redis_password)}@redis:6379/0"
        f"?ssl_cert_reqs=required&ssl_ca_certs={quote(redis_ca_cert, safe='/:')}&ssl_check_hostname=false"
    )

    rendered = {
        "postgres_password": postgres_password,
        "redis_password": redis_password,
        "jwt_secret": jwt_secret,
        "master_key": master_key,
        "master_key_previous": master_key_previous,
        "bind_password_enc_keys": bind_password_enc_keys,
        "bind_password_enc_active_kid": bind_password_enc_active_kid,
        "minio_root_user": minio_root_user,
        "minio_root_password": minio_root_password,
        "minio_access_key": minio_root_user,
        "minio_secret_key": minio_root_password,
        "backend_database_url": backend_database_url,
        "backend_redis_url": backend_redis_url,
        "grafana_admin_password": grafana_admin_password,
        "initial_admin_password": initial_admin_password,
        "minio_endpoint": minio_endpoint,
        "minio_bucket_name": minio_bucket,
        "minio_secure": minio_secure,
    }

    for name, value in rendered.items():
        _write_secret(output_dir, name, value)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="render_runtime_secrets")
    parser.add_argument(
        "--output-dir",
        default=os.getenv("PORTAL_RUNTIME_SECRETS_DIR") or "/run/secrets",
        help="Directory where docker-compose secret files will be written.",
    )
    parser.add_argument(
        "--secrets-file",
        default=os.getenv("PORTAL_SECRETS_FILE") or str(secretctl.DEFAULT_SECRETS_FILE),
        help="Encrypted YAML secrets file.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    render_runtime_secrets(Path(args.output_dir), secrets_file=Path(args.secrets_file))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"render-runtime-secrets: {exc}", file=sys.stderr)
        raise SystemExit(1)
