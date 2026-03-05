from __future__ import annotations

import ssl
from typing import Any

from sqlalchemy.engine import make_url

_TLS_SSL_VALUES = {"1", "true", "require"}
_TLS_SSLMODES = {"require", "verify-ca", "verify-full"}
_STRICT_SSLMODES = {"verify-ca", "verify-full"}
_ASYNC_PG_TLS_QUERY_KEYS = {"ssl", "sslmode", "sslrootcert", "sslcert", "sslkey", "sslcrl"}


def _parse_tls_query(database_url: str) -> dict[str, str]:
    url = make_url(database_url)
    query = dict(url.query)
    return {
        "ssl": str(query.get("ssl", "")).strip().lower(),
        "sslmode": str(query.get("sslmode", "")).strip().lower(),
        "sslrootcert": str(query.get("sslrootcert", "")).strip(),
        "sslcert": str(query.get("sslcert", "")).strip(),
        "sslkey": str(query.get("sslkey", "")).strip(),
    }


def database_url_requests_tls(database_url: str) -> bool:
    tls = _parse_tls_query(database_url)
    return tls["ssl"] in _TLS_SSL_VALUES or tls["sslmode"] in _TLS_SSLMODES


def validate_database_tls_policy(database_url: str, strict_mode: bool) -> None:
    if not strict_mode:
        return
    tls = _parse_tls_query(database_url)
    if tls["sslmode"] not in _STRICT_SSLMODES:
        raise ValueError(
            "DATABASE_URL must use sslmode=verify-ca or sslmode=verify-full when DB_TLS_STRICT=true."
        )


def build_asyncpg_url_and_connect_args(database_url: str) -> tuple[str, dict[str, Any]]:
    url = make_url(database_url)
    query = dict(url.query)

    ssl_value = str(query.get("ssl", "")).strip().lower()
    sslmode_value = str(query.get("sslmode", "")).strip().lower()
    sslrootcert_value = str(query.get("sslrootcert", "")).strip()
    sslcert_value = str(query.get("sslcert", "")).strip()
    sslkey_value = str(query.get("sslkey", "")).strip()

    connect_args: dict[str, Any] = {}
    if ssl_value in _TLS_SSL_VALUES or sslmode_value in _TLS_SSLMODES:
        ssl_ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        if sslrootcert_value:
            ssl_ctx.load_verify_locations(cafile=sslrootcert_value)
        if sslcert_value and sslkey_value:
            ssl_ctx.load_cert_chain(certfile=sslcert_value, keyfile=sslkey_value)
        ssl_ctx.verify_mode = ssl.CERT_REQUIRED
        ssl_ctx.check_hostname = sslmode_value == "verify-full"
        connect_args["ssl"] = ssl_ctx

    for key in _ASYNC_PG_TLS_QUERY_KEYS:
        query.pop(key, None)

    normalized_url = url.set(query=query).render_as_string(hide_password=False)
    return normalized_url, connect_args
