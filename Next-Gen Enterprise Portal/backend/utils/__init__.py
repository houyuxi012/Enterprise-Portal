"""Compatibility exports for legacy auth/security imports.

Older IAM modules still import helpers from ``utils``. The canonical source is
``core.security``; keep this shim so runtime paths and tests continue to work
until those legacy imports are fully removed.
"""

from core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    COOKIE_DOMAIN,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    CORS_ORIGINS,
    create_access_token,
    get_jwt_secret,
    get_password_hash,
    verify_password,
)

__all__ = [
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "ALGORITHM",
    "COOKIE_DOMAIN",
    "COOKIE_SAMESITE",
    "COOKIE_SECURE",
    "CORS_ORIGINS",
    "create_access_token",
    "get_jwt_secret",
    "get_password_hash",
    "verify_password",
]
