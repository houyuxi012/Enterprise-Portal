from __future__ import annotations

import hashlib
import io
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
import utils
from iam.audit.service import IAMAuditService
from iam.identity.service import IdentityService
from modules.iam.services.privacy_consent import (
    build_mfa_privacy_claims,
    persist_authenticated_privacy_consent,
    prepare_login_privacy_consent,
)
from modules.iam.services.identity.providers import (
    IdentityAuthResult,
    IdentityProviderError,
    LdapIdentityProvider,
    LocalIdentityProvider,
)


class ProviderIdentityService:
    """Portal auth orchestration with pluggable providers."""

    _providers = {
        "local": LocalIdentityProvider(),
        "ldap": LdapIdentityProvider(),
        "ad": LdapIdentityProvider(),
    }

    @classmethod
    def _normalize_provider(cls, provider: str | None) -> str:
        value = str(provider or "ldap").strip().lower()
        return value if value in cls._providers else "ldap"

    @classmethod
    async def _resolve_portal_provider_for_user(
        cls,
        db: AsyncSession,
        *,
        username: str,
        requested_provider: str,
    ) -> str:
        """
        Route portal auth by identity source:
        - Local-only users (no directory binding) authenticate with local provider.
        - Directory-bound users keep LDAP/AD auth.
        """
        normalized = cls._normalize_provider(requested_provider)
        result = await db.execute(
            select(models.User.auth_source, models.User.directory_id)
            .filter(models.User.username == username)
            .limit(1)
        )
        row = result.first()
        if not row:
            return normalized

        auth_source = str(row[0] or "local").strip().lower()
        directory_id = row[1]

        # Local request should still allow directory-bound users to authenticate via LDAP/AD.
        if normalized == "local":
            if directory_id is not None or auth_source in {"ldap", "ad"}:
                return "ad" if auth_source == "ad" else "ldap"
            return "local"

        if normalized not in {"ldap", "ad"}:
            return normalized

        # LDAP/AD request should still allow local-only users to authenticate locally.
        if directory_id is None and auth_source in {"", "local"}:
            return "local"
        return normalized

    @classmethod
    async def _get_enabled_directory(
        cls,
        db: AsyncSession,
        *,
        provider: str,
    ) -> models.DirectoryConfig:
        stmt = (
            select(models.DirectoryConfig)
            .filter(models.DirectoryConfig.enabled == True)  # noqa: E712
            .order_by(desc(models.DirectoryConfig.updated_at), desc(models.DirectoryConfig.id))
        )
        if provider in {"ldap", "ad"}:
            stmt = stmt.filter(models.DirectoryConfig.type.in_(["ldap", "ad"]))
        result = await db.execute(stmt.limit(1))
        config = result.scalars().first()
        if not config:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "DIRECTORY_NOT_CONFIGURED",
                    "message": "No enabled LDAP/AD directory configuration found",
                },
            )
        return config

    @classmethod
    async def _get_default_role(cls, db: AsyncSession) -> models.Role | None:
        role_result = await db.execute(
            select(models.Role).filter(
                models.Role.app_id == "portal",
                models.Role.code == "user",
            )
        )
        return role_result.scalars().first()

    @classmethod
    async def _resolve_unique_user_email(cls, db: AsyncSession, email: str | None, username: str) -> str | None:
        candidate = (email or "").strip() or None
        if not candidate:
            return None
        existing = await db.execute(select(models.User.id).filter(models.User.email == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
        # Avoid duplicate email conflict while keeping deterministic suffix.
        fallback = f"{username}+ldap@local.invalid"
        existing_fallback = await db.execute(select(models.User.id).filter(models.User.email == fallback))
        return None if existing_fallback.scalar_one_or_none() else fallback

    _avatar_logger = logging.getLogger(__name__ + ".avatar")

    @staticmethod
    def _upload_avatar_to_storage(
        blob: bytes, username: str, *, existing_hash: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Upload raw avatar bytes to object storage with SHA-256 dedup.

        Returns (avatar_url, sha256_hex).  If the hash matches *existing_hash*
        the upload is skipped and (None, existing_hash) is returned so the
        caller can keep the old URL.
        """
        import logging
        from modules.iam.services.identity.sync_errors import SYNC_AVATAR_DEDUP_HIT, SYNC_AVATAR_UPLOAD_FAILED
        _log = logging.getLogger(__name__)

        avatar_hash = hashlib.sha256(blob).hexdigest()

        # Dedup: same hash as existing → skip upload
        if existing_hash and avatar_hash == existing_hash:
            _log.debug("avatar_dedup code=%s user=%s hash=%s", SYNC_AVATAR_DEDUP_HIT, username, avatar_hash)
            return None, avatar_hash  # caller keeps old URL

        try:
            from infrastructure.storage import storage as _storage

            if blob.startswith(b"\x89PNG\r\n\x1a\n"):
                ext, mime = "png", "image/png"
            elif blob.startswith((b"GIF87a", b"GIF89a")):
                ext, mime = "gif", "image/gif"
            elif blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
                ext, mime = "webp", "image/webp"
            else:
                ext, mime = "jpg", "image/jpeg"

            filename = f"avatars/ldap-{username}-{avatar_hash[:12]}.{ext}"

            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    pool.submit(
                        _storage.client.put_object,
                        _storage.bucket,
                        filename,
                        io.BytesIO(blob),
                        len(blob),
                        mime,
                    ).result(timeout=10)
            else:
                _storage.client.put_object(
                    _storage.bucket, filename, io.BytesIO(blob), len(blob), mime
                )

            url = _storage.get_url(filename, is_public=True)
            return url, avatar_hash
        except Exception as exc:
            _log.warning("avatar_upload_failed code=%s user=%s err=%s", SYNC_AVATAR_UPLOAD_FAILED, username, exc)
            return None, avatar_hash  # caller should keep old URL (fallback)

    @classmethod
    async def _ensure_employee_profile(
        cls,
        db: AsyncSession,
        user: models.User,
        *,
        mobile: str | None = None,
        department: str | None = None,
        primary_department_id: int | None = None,
        avatar_hash: str | None = None,
    ) -> None:
        mobile = str(mobile or "").strip() or None
        emp_result = await db.execute(select(models.Employee).filter(models.Employee.account == user.username))
        employee = emp_result.scalars().first()
        if employee:
            employee.name = user.name or employee.name or user.username
            if user.email:
                employee.email = user.email
            employee.avatar = user.avatar
            if mobile:
                employee.phone = mobile
            if department:
                employee.department = department
            if primary_department_id is not None:
                employee.primary_department_id = primary_department_id
            if avatar_hash:
                employee.avatar_hash = avatar_hash
            employee.status = "Active"
            return

        candidate_email = user.email or f"{user.username}@ldap.local"
        email_in_use = await db.execute(select(models.Employee.id).filter(models.Employee.email == candidate_email))
        if email_in_use.scalar_one_or_none() is not None:
            candidate_email = f"{user.username}.{int(datetime.now(timezone.utc).timestamp())}@ldap.local"

        db.add(
            models.Employee(
                account=user.username,
                job_number=None,
                name=user.name or user.username,
                gender="未知",
                department=department or "未分配",
                primary_department_id=primary_department_id,
                role="",
                email=candidate_email,
                phone=mobile or "-",
                location="",
                avatar=user.avatar,
                avatar_hash=avatar_hash,
                status="Active",
            )
        )

    @classmethod
    async def _jit_upsert_portal_user(
        cls,
        db: AsyncSession,
        *,
        auth_result: IdentityAuthResult,
        directory_id: int | None,
        auth_source: str = "local",
        org_mapping_name: dict[str, str] | None = None,
        dn_to_dept_name: dict[str, str] | None = None,
        dn_to_dept_id: dict[str, int] | None = None,
    ) -> models.User:
        user: models.User | None = None
        if directory_id and auth_result.external_id:
            link_result = await db.execute(
                select(models.User).filter(
                    models.User.directory_id == directory_id,
                    models.User.external_id == auth_result.external_id,
                )
            )
            user = link_result.scalars().first()

        if user is None:
            result = await db.execute(select(models.User).filter(models.User.username == auth_result.username))
            user = result.scalars().first()

        if user and (user.account_type or "PORTAL").upper() != "PORTAL":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "PORTAL_ACCOUNT_REQUIRED",
                    "message": "Access denied: PORTAL account required.",
                },
            )

        # ── Avatar: dedup-aware upload ────────────────────────────────
        raw_avatar = (auth_result.attributes or {}).get("avatar")
        avatar_url: str | None = None
        avatar_hash: str | None = None

        # Retrieve existing employee avatar_hash for dedup
        existing_hash: str | None = None
        if user:
            emp_q = await db.execute(
                select(models.Employee.avatar_hash).filter(models.Employee.account == user.username)
            )
            existing_hash = emp_q.scalar_one_or_none()

        if isinstance(raw_avatar, (bytes, bytearray)):
            avatar_url, avatar_hash = cls._upload_avatar_to_storage(
                bytes(raw_avatar), auth_result.username, existing_hash=existing_hash,
            )
        elif isinstance(raw_avatar, str) and raw_avatar:
            avatar_url = raw_avatar

        if user is None:
            generated_password = secrets.token_urlsafe(24)
            safe_email = await cls._resolve_unique_user_email(db, auth_result.email, auth_result.username)
            user = models.User(
                username=auth_result.username,
                email=safe_email,
                hashed_password=await utils.get_password_hash(generated_password),
                account_type="PORTAL",
                is_active=True,
                name=auth_result.display_name or auth_result.username,
                avatar=avatar_url,
                directory_id=directory_id,
                external_id=auth_result.external_id,
                auth_source=auth_source,
            )
            default_role = await cls._get_default_role(db)
            if default_role:
                user.roles = [default_role]
            db.add(user)
            await db.flush()
        else:
            if auth_result.display_name:
                user.name = auth_result.display_name
            if auth_result.email:
                user.email = auth_result.email
            if avatar_url:
                user.avatar = avatar_url
            if directory_id:
                user.directory_id = directory_id
            if auth_result.external_id:
                user.external_id = auth_result.external_id
            user.auth_source = auth_source
            # Clear pending delete marker & restore status if user re-appears in source
            if user.pending_delete_at is not None:
                user.pending_delete_at = None
                user.status = "active"
            db.add(user)
            await db.flush()

        # Resolve department string & primary department ID
        dept_name = None
        primary_dept_id = None
        if getattr(auth_result, "department_external_ids", None):
            for ext_id in auth_result.department_external_ids:
                dept_name = (dn_to_dept_name or {}).get(ext_id) or (org_mapping_name or {}).get(ext_id)
                if not primary_dept_id:
                    primary_dept_id = (dn_to_dept_id or {}).get(ext_id)
                if dept_name:
                    break

        await cls._ensure_employee_profile(
            db,
            user,
            mobile=(auth_result.attributes or {}).get("mobile"),
            department=dept_name,
            primary_department_id=primary_dept_id,
            avatar_hash=avatar_hash,
        )
        
        return user

    @classmethod
    async def _jit_upsert_org(
        cls,
        db: AsyncSession,
        directory_id: int,
        org: IdentityAuthOrgResult,
    ) -> models.Department:
        result = await db.execute(
            select(models.Department).filter(
                models.Department.directory_id == directory_id,
                models.Department.external_id == org.external_id,
            )
        )
        dept = result.scalars().first()
        if not dept:
            dept = models.Department(
                name=org.name,
                directory_id=directory_id,
                external_id=org.external_id,
            )
            db.add(dept)
        else:
            if dept.name != org.name:
                dept.name = org.name
                db.add(dept)
        return dept

    @classmethod
    async def _jit_upsert_group_as_role(
        cls,
        db: AsyncSession,
        directory_id: int,
        group: IdentityAuthGroupResult,
    ) -> models.Role:
        result = await db.execute(
            select(models.Role).filter(
                models.Role.directory_id == directory_id,
                models.Role.external_id == group.external_id,
            )
        )
        role = result.scalars().first()
        if not role:
            # We must assign a basic code. Avoid clashing.
            safe_code = f"dir_{directory_id}_grp_{hashlib.md5(group.external_id.encode()).hexdigest()[:8]}"
            role = models.Role(
                name=group.name,
                code=safe_code,
                app_id="portal",
                description=group.description,
                directory_id=directory_id,
                external_id=group.external_id,
            )
            db.add(role)
        else:
            if role.name != group.name or role.description != group.description:
                role.name = group.name
                role.description = group.description
                db.add(role)
        return role



    @classmethod
    async def _issue_portal_token(
        cls,
        *,
        db: AsyncSession,
        request: Request,
        response: Response,
        user: models.User,
    ) -> dict[str, Any]:
        config_result = await db.execute(select(models.SystemConfig))
        configs = {c.key: c.value for c in config_result.scalars().all()}
        # This method is called for Portal audience only (see audience="portal" below).
        session_timeout = IdentityService._parse_int_config(
            configs,
            "login_session_timeout_minutes",
            utils.ACCESS_TOKEN_EXPIRE_MINUTES,
            min_value=5,
            max_value=43200,
        )
        max_concurrent_sessions = IdentityService._parse_int_config(
            configs,
            "max_concurrent_sessions",
            0,
            min_value=0,
            max_value=100,
        )

        active_session_count = await IdentityService._cleanup_expired_sessions(
            user_id=user.id,
            audience="portal",
            session_timeout_minutes=session_timeout,
        )
        if max_concurrent_sessions > 0 and active_session_count >= max_concurrent_sessions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "CONCURRENT_SESSION_LIMIT",
                    "message": "该用户超过并发设定，请退出其他设备后再次尝试登陆",
                },
            )

        previous_token = request.cookies.get("portal_session")
        if previous_token:
            await IdentityService._revoke_token(previous_token, db=db)

        session_start_epoch = int(datetime.now(timezone.utc).timestamp())
        access_token_expires = timedelta(minutes=session_timeout)
        access_token = utils.create_access_token(
            data={"sub": user.username, "uid": user.id, "session_start": session_start_epoch},
            expires_delta=access_token_expires,
            audience="portal",
        )

        _, token_audience, new_jti, new_exp = await IdentityService._extract_token_session_meta(
            access_token,
            db=db,
        )
        await IdentityService._add_active_session(
            user_id=user.id,
            audience=token_audience or "portal",
            jti=new_jti,
            exp_epoch=new_exp,
            session_timeout_minutes=session_timeout,
        )

        session_timeout_seconds = int(session_timeout) * 60
        response.set_cookie(
            key="portal_session",
            value=access_token,
            httponly=True,
            max_age=session_timeout_seconds,
            expires=session_timeout_seconds,
            samesite=utils.COOKIE_SAMESITE,
            secure=utils.COOKIE_SECURE,
            domain=utils.COOKIE_DOMAIN,
            path="/",
        )
        return {"message": "Login successful", "token_type": "bearer", "access_token": access_token}

    @classmethod
    async def authenticate_portal(
        cls,
        *,
        db: AsyncSession,
        request: Request,
        response: Response,
        username: str,
        password: str,
        provider: str,
    ) -> dict[str, Any]:
        normalized_provider = await cls._resolve_portal_provider_for_user(
            db,
            username=username,
            requested_provider=provider,
        )
        provider_impl = cls._providers[normalized_provider]
        ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("User-Agent", "unknown")
        trace_id = request.headers.get("X-Request-ID")

        directory: models.DirectoryConfig | None = None
        if normalized_provider in {"ldap", "ad"}:
            directory = await cls._get_enabled_directory(db, provider=normalized_provider)
        resolved_auth_source = normalized_provider if normalized_provider in {"ldap", "ad", "oidc"} else "local"

        try:
            auth_result = await provider_impl.authenticate(
                db=db,
                username=username,
                password=password,
                request=request,
                directory_config=directory,
            )
            user = await cls._jit_upsert_portal_user(
                db,
                auth_result=auth_result,
                directory_id=(directory.id if directory else None),
                auth_source=resolved_auth_source,
            )
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"code": "ACCOUNT_DISABLED", "message": "Account is disabled."},
                )

            pending_privacy_consent = await prepare_login_privacy_consent(
                db=db,
                request=request,
                user=user,
                audience="portal",
            )

            # ── MFA Challenge Gate ──
            mfa_forced = False
            try:
                from modules.iam.services.auth_helpers import get_system_mfa_config
                mfa_forced = await get_system_mfa_config(db)
            except Exception:
                pass

            enabled_mfa_methods = await IdentityService._get_enabled_mfa_methods(user, db)

            if enabled_mfa_methods:
                # User has at least one MFA factor bound → require MFA challenge
                if "email" in enabled_mfa_methods:
                    try:
                        from modules.iam.services.email_service import send_email_otp

                        await send_email_otp(user.email, user.username, db)
                    except Exception as e:
                        if set(enabled_mfa_methods) == {"email"}:
                            raise HTTPException(
                                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                                detail={
                                    "code": "EMAIL_MFA_SEND_FAILED",
                                    "message": f"邮箱验证码发送失败：{e}",
                                },
                            )
                        logger.warning(
                            "Failed to send email MFA code for user=%s during login challenge: %s",
                            user.username,
                            e,
                        )

                from modules.iam.services.auth_helpers import create_mfa_token
                mfa_token = create_mfa_token(
                    user,
                    provider=normalized_provider,
                    extra_claims=build_mfa_privacy_claims(pending_privacy_consent),
                )
                await db.commit()
                return {
                    "message": "MFA verification required",
                    "token_type": "bearer",
                    "access_token": "",
                    "mfa_required": True,
                    "mfa_token": mfa_token,
                    "mfa_methods": enabled_mfa_methods,
                    "provider": normalized_provider,
                }

            await persist_authenticated_privacy_consent(
                db=db,
                request=request,
                user=user,
                audience="portal",
                consent=pending_privacy_consent,
            )
            token_payload = await cls._issue_portal_token(
                db=db,
                request=request,
                response=response,
                user=user,
            )
            await IAMAuditService.log(
                db=db,
                action="IAM_AUTH_LDAP_LOGIN_SUCCESS" if normalized_provider in {"ldap", "ad"} else "iam.login.success",
                target_type="session",
                user_id=user.id,
                username=user.username,
                target_id=user.id,
                target_name=user.username,
                detail={
                    "provider": normalized_provider,
                    "directory_id": directory.id if directory else None,
                },
                result="success",
                ip_address=ip,
                user_agent=user_agent,
                trace_id=trace_id,
            )
            await db.commit()
            result = {**token_payload, "provider": normalized_provider}
            if mfa_forced and not enabled_mfa_methods:
                result["mfa_setup_required"] = True
            return result
        except IdentityProviderError as e:
            # When LDAP/AD auth cannot match or verify credentials, try local fallback
            # so local-only portal users can login from the same portal form.
            if normalized_provider in {"ldap", "ad"} and e.code in {"INVALID_CREDENTIALS", "LDAP_USER_NOT_FOUND"}:
                try:
                    local_impl = cls._providers["local"]
                    local_result = await local_impl.authenticate(
                        db=db,
                        username=username,
                        password=password,
                        request=request,
                    )
                    user = await cls._jit_upsert_portal_user(
                        db,
                        auth_result=local_result,
                        directory_id=None,
                        auth_source="local",
                    )
                    if not user.is_active:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail={"code": "ACCOUNT_DISABLED", "message": "Account is disabled."},
                        )
                    pending_privacy_consent = await prepare_login_privacy_consent(
                        db=db,
                        request=request,
                        user=user,
                        audience="portal",
                    )
                    fallback_mfa_methods = await IdentityService._get_enabled_mfa_methods(user, db)
                    if fallback_mfa_methods:
                        if "email" in fallback_mfa_methods:
                            try:
                                from modules.iam.services.email_service import send_email_otp

                                await send_email_otp(user.email, user.username, db)
                            except Exception as email_exc:
                                if set(fallback_mfa_methods) == {"email"}:
                                    raise HTTPException(
                                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                                        detail={
                                            "code": "EMAIL_MFA_SEND_FAILED",
                                            "message": f"邮箱验证码发送失败：{email_exc}",
                                        },
                                    )
                        from modules.iam.services.auth_helpers import create_mfa_token

                        mfa_token = create_mfa_token(
                            user,
                            provider="local",
                            extra_claims=build_mfa_privacy_claims(pending_privacy_consent),
                        )
                        await db.commit()
                        return {
                            "message": "MFA verification required",
                            "token_type": "bearer",
                            "access_token": "",
                            "mfa_required": True,
                            "mfa_token": mfa_token,
                            "mfa_methods": fallback_mfa_methods,
                            "provider": "local",
                        }
                    await persist_authenticated_privacy_consent(
                        db=db,
                        request=request,
                        user=user,
                        audience="portal",
                        consent=pending_privacy_consent,
                    )
                    token_payload = await cls._issue_portal_token(
                        db=db,
                        request=request,
                        response=response,
                        user=user,
                    )
                    await IAMAuditService.log(
                        db=db,
                        action="iam.login.success",
                        target_type="session",
                        user_id=user.id,
                        username=user.username,
                        target_id=user.id,
                        target_name=user.username,
                        detail={"provider": "local", "fallback_from": normalized_provider},
                        result="success",
                        ip_address=ip,
                        user_agent=user_agent,
                        trace_id=trace_id,
                    )
                    await db.commit()
                    result = {**token_payload, "provider": "local"}
                    if mfa_forced and not fallback_mfa_methods:
                        result["mfa_setup_required"] = True
                    return result
                except (IdentityProviderError, HTTPException):
                    pass  # Local fallback also failed, fall through to original error

            await IAMAuditService.log(
                db=db,
                action="IAM_AUTH_LDAP_LOGIN_FAIL" if normalized_provider in {"ldap", "ad"} else "iam.login.fail",
                target_type="session",
                username=username,
                target_name=username,
                detail={
                    "provider": normalized_provider,
                    "directory_id": directory.id if directory else None,
                },
                result="fail",
                reason=e.code,
                ip_address=ip,
                user_agent=user_agent,
                trace_id=trace_id,
            )
            await db.commit()
            raise HTTPException(
                status_code=e.status_code,
                detail={"code": e.code, "message": e.message},
            )
        except HTTPException as e:
            await IAMAuditService.log(
                db=db,
                action="IAM_AUTH_LDAP_LOGIN_FAIL" if normalized_provider in {"ldap", "ad"} else "iam.login.fail",
                target_type="session",
                username=username,
                target_name=username,
                detail={
                    "provider": normalized_provider,
                    "directory_id": directory.id if directory else None,
                },
                result="fail",
                reason=str((e.detail or {}).get("code") if isinstance(e.detail, dict) else "AUTH_FAILED"),
                ip_address=ip,
                user_agent=user_agent,
                trace_id=trace_id,
            )
            await db.commit()
            raise
