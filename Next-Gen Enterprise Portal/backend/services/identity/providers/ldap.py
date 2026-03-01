from __future__ import annotations

import base64
import ssl
from functools import partial
from typing import Any

import anyio
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from services.crypto_keyring import BindPasswordKeyring, KeyringConfigError
from services.identity.providers.base import IdentityAuthResult, IdentityProvider, IdentityProviderError
from services.license_service import LicenseService


def _load_ldap_runtime():
    try:
        import ldap3
        from ldap3.core.exceptions import LDAPException, LDAPBindError
        from ldap3.utils.conv import escape_filter_chars

        return ldap3, LDAPException, LDAPBindError, escape_filter_chars
    except Exception as e:  # pragma: no cover - import guard
        raise IdentityProviderError(
            code="LDAP_RUNTIME_MISSING",
            message=f"LDAP runtime unavailable: {e}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class LdapIdentityProvider(IdentityProvider):
    provider_name = "ldap"

    @staticmethod
    def _bind_password_aad(directory_id: int | None) -> bytes:
        if directory_id is None:
            raise IdentityProviderError(
                code="DIRECTORY_ID_REQUIRED",
                message="Directory id is required for bind password decryption",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return b"bind_password:" + str(int(directory_id)).encode("utf-8")

    @staticmethod
    def _normalize_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        text = str(value or "").strip().lower()
        return text in {"1", "true", "yes", "on"}

    @classmethod
    def _resolve_bind_password(cls, directory_config) -> str:
        plain = str(getattr(directory_config, "bind_password_plain", "") or "").strip()
        if plain:
            return plain

        ciphertext = str(getattr(directory_config, "bind_password_ciphertext", "") or "").strip()
        if not ciphertext:
            return ""
        try:
            return BindPasswordKeyring.decrypt_bind_password(
                ciphertext,
                aad=cls._bind_password_aad(getattr(directory_config, "id", None)),
            )
        except KeyringConfigError as e:
            raise IdentityProviderError(
                code=e.code,
                message=str(e),
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @staticmethod
    def _safe_dn(dn: str | None) -> str | None:
        text = str(dn or "").strip()
        if not text:
            return None
        return text.split(",", 1)[0]

    @staticmethod
    def _entry_attr_value(entry: Any, attr_name: str, fallback: str | None = None) -> str | None:
        name = str(attr_name or "").strip()
        if not name:
            return fallback

        try:
            values = getattr(entry, "entry_attributes_as_dict", {}) or {}
            value = values.get(name)
            if isinstance(value, list):
                value = value[0] if value else None
            text = str(value or "").strip()
            if text:
                return text
        except Exception:
            pass

        try:
            field = getattr(entry, name, None)
            value = getattr(field, "value", None)
            text = str(value or "").strip()
            if text:
                return text
        except Exception:
            pass

        return fallback

    @staticmethod
    def _entry_attr_raw(entry: Any, attr_name: str) -> Any | None:
        name = str(attr_name or "").strip()
        if not name:
            return None

        try:
            values = getattr(entry, "entry_attributes_as_dict", {}) or {}
            value = values.get(name)
            if isinstance(value, list):
                return value[0] if value else None
            if value is not None:
                return value
        except Exception:
            pass

        try:
            field = getattr(entry, name, None)
            raw_values = getattr(field, "raw_values", None)
            if isinstance(raw_values, list) and raw_values:
                return raw_values[0]
            value = getattr(field, "value", None)
            if value is not None:
                return value
        except Exception:
            pass
        return None

    @staticmethod
    def _guess_image_mime(blob: bytes) -> str:
        if blob.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if blob.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if blob.startswith((b"GIF87a", b"GIF89a")):
            return "image/gif"
        if blob.startswith(b"BM"):
            return "image/bmp"
        return "image/jpeg"

    @classmethod
    def _resolve_avatar(cls, entry: Any, attr_name: str) -> str | None:
        raw = cls._entry_attr_raw(entry, attr_name)
        if raw is None:
            return None
        if isinstance(raw, str):
            text = raw.strip()
            return text or None
        if isinstance(raw, (bytes, bytearray)):
            blob = bytes(raw)
            if not blob or len(blob) > 262_144:
                return None
            mime = cls._guess_image_mime(blob)
            encoded = base64.b64encode(blob).decode("ascii")
            return f"data:{mime};base64,{encoded}"
        return None

    @classmethod
    def _sync_test_connection(
        cls,
        *,
        directory_config,
        username: str | None = None,
        password: str | None = None,
    ) -> dict[str, Any]:
        ldap3, LDAPException, LDAPBindError, escape_filter_chars = _load_ldap_runtime()

        bind_password = cls._resolve_bind_password(directory_config)

        tls = ldap3.Tls(validate=ssl.CERT_REQUIRED)
        server = ldap3.Server(
            host=directory_config.host,
            port=int(directory_config.port),
            use_ssl=cls._normalize_bool(directory_config.use_ssl),
            tls=tls,
            get_info=ldap3.NONE,
        )

        conn = ldap3.Connection(
            server=server,
            user=directory_config.bind_dn or None,
            password=bind_password or None,
            auto_bind=False,
            receive_timeout=10,
            raise_exceptions=False,
        )

        try:
            conn.open()
            if conn.closed:
                raise IdentityProviderError(
                    code="LDAP_CONNECT_FAILED",
                    message=f"Cannot connect to LDAP server {directory_config.host}:{directory_config.port}",
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )
            if cls._normalize_bool(directory_config.start_tls):
                if not conn.start_tls():
                    raise IdentityProviderError(
                        code="LDAP_STARTTLS_FAILED",
                        message=f"StartTLS failed: {conn.result.get('description')}",
                        status_code=status.HTTP_502_BAD_GATEWAY,
                    )
            if directory_config.bind_dn and not conn.bind():
                raise IdentityProviderError(
                    code="LDAP_BIND_FAILED",
                    message=f"Bind DN authentication failed: {conn.result.get('description')}",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            if (username or "").strip() and (password or "").strip():
                auth_result = cls._sync_authenticate(
                    directory_config=directory_config,
                    username=username,
                    password=password,
                )
                return {
                    "success": True,
                    "message": "LDAP connection and credential check succeeded",
                    "matched_dn": cls._safe_dn(auth_result.user_dn),
                    "attributes": {
                        "username": auth_result.username,
                        "email": auth_result.email,
                        "display_name": auth_result.display_name,
                        "mobile": (auth_result.attributes or {}).get("mobile"),
                        "avatar_synced": bool((auth_result.attributes or {}).get("avatar")),
                    },
                }

            probe_filter = directory_config.user_filter or "(&(objectClass=user)(sAMAccountName={username}))"
            probe_filter = probe_filter.replace("{username}", escape_filter_chars("__health_probe__"))
            conn.search(
                search_base=directory_config.base_dn,
                search_filter=probe_filter,
                search_scope=ldap3.SUBTREE,
                attributes=[directory_config.username_attr],
                size_limit=1,
            )
            return {
                "success": True,
                "message": "LDAP connection test succeeded",
                "matched_dn": None,
                "attributes": {},
            }
        except IdentityProviderError:
            raise
        except (LDAPBindError, LDAPException) as e:
            raise IdentityProviderError(
                code="LDAP_TEST_FAILED",
                message=f"LDAP test failed: {e}",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )
        finally:
            try:
                conn.unbind()
            except Exception:
                pass

    @classmethod
    def _sync_authenticate(
        cls,
        *,
        directory_config,
        username: str,
        password: str,
    ) -> IdentityAuthResult:
        ldap3, LDAPException, LDAPBindError, escape_filter_chars = _load_ldap_runtime()

        bind_password = cls._resolve_bind_password(directory_config)

        tls = ldap3.Tls(validate=ssl.CERT_REQUIRED)
        server = ldap3.Server(
            host=directory_config.host,
            port=int(directory_config.port),
            use_ssl=cls._normalize_bool(directory_config.use_ssl),
            tls=tls,
            get_info=ldap3.NONE,
        )

        admin_conn = ldap3.Connection(
            server=server,
            user=directory_config.bind_dn or None,
            password=bind_password or None,
            auto_bind=False,
            receive_timeout=10,
            raise_exceptions=False,
        )
        user_conn = None
        try:
            admin_conn.open()
            if admin_conn.closed:
                raise IdentityProviderError(
                    code="LDAP_CONNECT_FAILED",
                    message="Cannot connect to LDAP server",
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )
            if cls._normalize_bool(directory_config.start_tls):
                if not admin_conn.start_tls():
                    raise IdentityProviderError(
                        code="LDAP_STARTTLS_FAILED",
                        message=f"StartTLS failed: {admin_conn.result.get('description')}",
                        status_code=status.HTTP_502_BAD_GATEWAY,
                    )

            if directory_config.bind_dn and not admin_conn.bind():
                raise IdentityProviderError(
                    code="LDAP_BIND_FAILED",
                    message=f"Bind DN authentication failed: {admin_conn.result.get('description')}",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            escaped_username = escape_filter_chars(username)
            search_filter = (directory_config.user_filter or "").replace("{username}", escaped_username)
            if not search_filter:
                raise IdentityProviderError(
                    code="LDAP_CONFIG_ERROR",
                    message="Directory user_filter is required",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            found = admin_conn.search(
                search_base=directory_config.base_dn,
                search_filter=search_filter,
                search_scope=ldap3.SUBTREE,
                attributes=[
                    directory_config.username_attr,
                    directory_config.email_attr,
                    directory_config.display_name_attr,
                    directory_config.mobile_attr or "mobile",
                    directory_config.avatar_attr or "thumbnailPhoto",
                ],
                size_limit=1,
            )
            if not found or not admin_conn.entries:
                raise IdentityProviderError(
                    code="LDAP_USER_NOT_FOUND",
                    message="Directory user not found",
                    status_code=status.HTTP_401_UNAUTHORIZED,
                )

            entry = admin_conn.entries[0]
            user_dn = str(entry.entry_dn)
            user_conn = ldap3.Connection(
                server=server,
                user=user_dn,
                password=password,
                auto_bind=False,
                receive_timeout=10,
                raise_exceptions=False,
            )
            user_conn.open()
            if user_conn.closed:
                raise IdentityProviderError(
                    code="LDAP_CONNECT_FAILED",
                    message="Cannot connect to LDAP server",
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )
            if cls._normalize_bool(directory_config.start_tls):
                if not user_conn.start_tls():
                    raise IdentityProviderError(
                        code="LDAP_STARTTLS_FAILED",
                        message=f"StartTLS failed: {user_conn.result.get('description')}",
                        status_code=status.HTTP_502_BAD_GATEWAY,
                    )
            if not user_conn.bind():
                raise IdentityProviderError(
                    code="INVALID_CREDENTIALS",
                    message="Incorrect username or password",
                    status_code=status.HTTP_401_UNAUTHORIZED,
                )

            username_attr = directory_config.username_attr or "sAMAccountName"
            email_attr = directory_config.email_attr or "mail"
            display_name_attr = directory_config.display_name_attr or "displayName"
            mobile_attr = directory_config.mobile_attr or "mobile"
            avatar_attr = directory_config.avatar_attr or "thumbnailPhoto"
            resolved_username = cls._entry_attr_value(entry, username_attr, username) or username
            resolved_email = cls._entry_attr_value(entry, email_attr, None)
            resolved_name = cls._entry_attr_value(entry, display_name_attr, None)
            resolved_mobile = cls._entry_attr_value(entry, mobile_attr, None)
            resolved_avatar = cls._resolve_avatar(entry, avatar_attr)

            return IdentityAuthResult(
                provider=str(directory_config.type or "ldap").lower(),
                username=resolved_username,
                email=resolved_email,
                display_name=resolved_name,
                external_id=user_dn,
                user_dn=user_dn,
                attributes={
                    "mobile": resolved_mobile,
                    "avatar": resolved_avatar,
                },
            )
        except IdentityProviderError:
            raise
        except (LDAPBindError, LDAPException) as e:
            raise IdentityProviderError(
                code="LDAP_AUTH_FAILED",
                message=f"LDAP authentication failed: {e}",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        finally:
            try:
                admin_conn.unbind()
            except Exception:
                pass
            if user_conn is not None:
                try:
                    user_conn.unbind()
                except Exception:
                    pass

    @classmethod
    def _sync_list_users(
        cls,
        *,
        directory_config,
        limit: int = 1000,
    ) -> list[IdentityAuthResult]:
        ldap3, LDAPException, LDAPBindError, _ = _load_ldap_runtime()

        bind_password = cls._resolve_bind_password(directory_config)

        tls = ldap3.Tls(validate=ssl.CERT_REQUIRED)
        server = ldap3.Server(
            host=directory_config.host,
            port=int(directory_config.port),
            use_ssl=cls._normalize_bool(directory_config.use_ssl),
            tls=tls,
            get_info=ldap3.NONE,
        )

        conn = ldap3.Connection(
            server=server,
            user=directory_config.bind_dn or None,
            password=bind_password or None,
            auto_bind=False,
            receive_timeout=15,
            raise_exceptions=False,
        )
        try:
            conn.open()
            if conn.closed:
                raise IdentityProviderError(
                    code="LDAP_CONNECT_FAILED",
                    message="Cannot connect to LDAP server",
                    status_code=status.HTTP_502_BAD_GATEWAY,
                )
            if cls._normalize_bool(directory_config.start_tls):
                if not conn.start_tls():
                    raise IdentityProviderError(
                        code="LDAP_STARTTLS_FAILED",
                        message=f"StartTLS failed: {conn.result.get('description')}",
                        status_code=status.HTTP_502_BAD_GATEWAY,
                    )
            if directory_config.bind_dn and not conn.bind():
                raise IdentityProviderError(
                    code="LDAP_BIND_FAILED",
                    message=f"Bind DN authentication failed: {conn.result.get('description')}",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            user_filter = str(directory_config.user_filter or "").strip()
            if not user_filter:
                raise IdentityProviderError(
                    code="LDAP_CONFIG_ERROR",
                    message="Directory user_filter is required",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            user_filter = user_filter.replace("{username}", "*")
            username_attr = directory_config.username_attr or "sAMAccountName"
            email_attr = directory_config.email_attr or "mail"
            display_name_attr = directory_config.display_name_attr or "displayName"
            mobile_attr = directory_config.mobile_attr or "mobile"
            avatar_attr = directory_config.avatar_attr or "thumbnailPhoto"

            conn.search(
                search_base=directory_config.base_dn,
                search_filter=user_filter,
                search_scope=ldap3.SUBTREE,
                attributes=[
                    username_attr,
                    email_attr,
                    display_name_attr,
                    mobile_attr,
                    avatar_attr,
                ],
                size_limit=max(1, int(limit)),
            )

            synced: list[IdentityAuthResult] = []
            for entry in conn.entries:
                resolved_username = cls._entry_attr_value(entry, username_attr, None)
                if not resolved_username:
                    continue
                resolved_email = cls._entry_attr_value(entry, email_attr, None)
                resolved_name = cls._entry_attr_value(entry, display_name_attr, None)
                resolved_mobile = cls._entry_attr_value(entry, mobile_attr, None)
                resolved_avatar = cls._resolve_avatar(entry, avatar_attr)
                synced.append(
                    IdentityAuthResult(
                        provider=str(directory_config.type or "ldap").lower(),
                        username=resolved_username,
                        email=resolved_email,
                        display_name=resolved_name,
                        external_id=str(entry.entry_dn),
                        user_dn=str(entry.entry_dn),
                        attributes={
                            "mobile": resolved_mobile,
                            "avatar": resolved_avatar,
                        },
                    )
                )
            return synced
        except IdentityProviderError:
            raise
        except (LDAPBindError, LDAPException) as e:
            raise IdentityProviderError(
                code="LDAP_SYNC_FAILED",
                message=f"LDAP sync failed: {e}",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )
        finally:
            try:
                conn.unbind()
            except Exception:
                pass

    async def authenticate(
        self,
        *,
        db: AsyncSession,
        username: str,
        password: str,
        request=None,
        directory_config=None,
    ) -> IdentityAuthResult:
        await LicenseService.require_feature(db, "ldap")
        if directory_config is None:
            raise IdentityProviderError(
                code="DIRECTORY_NOT_CONFIGURED",
                message="No enabled LDAP/AD directory configuration found",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return await anyio.to_thread.run_sync(
            partial(
                self._sync_authenticate,
                directory_config=directory_config,
                username=username,
                password=password,
            )
        )

    async def test_connection(
        self,
        *,
        db: AsyncSession,
        directory_config,
        username: str | None = None,
        password: str | None = None,
        request=None,
    ) -> dict[str, Any]:
        await LicenseService.require_feature(db, "ldap")
        if directory_config is None:
            raise IdentityProviderError(
                code="DIRECTORY_NOT_FOUND",
                message="Directory config not found",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return await anyio.to_thread.run_sync(
            partial(
                self._sync_test_connection,
                directory_config=directory_config,
                username=username,
                password=password,
            )
        )

    async def sync_users(
        self,
        *,
        db: AsyncSession,
        directory_config,
        limit: int = 1000,
        request=None,
    ) -> list[IdentityAuthResult]:
        await LicenseService.require_feature(db, "ldap")
        if directory_config is None:
            raise IdentityProviderError(
                code="DIRECTORY_NOT_FOUND",
                message="Directory config not found",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return await anyio.to_thread.run_sync(
            partial(
                self._sync_list_users,
                directory_config=directory_config,
                limit=limit,
            )
        )
