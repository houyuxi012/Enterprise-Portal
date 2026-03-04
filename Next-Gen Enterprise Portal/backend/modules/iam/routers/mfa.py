"""
MFA (Multi-Factor Authentication) Router
/api/mfa/setup, /api/mfa/verify-setup, /api/mfa/disable, /api/mfa/status, /api/mfa/verify
/api/mfa/webauthn/* — FIDO2/WebAuthn hardware security key endpoints
"""
from __future__ import annotations

import base64
import io
import json
import logging
from datetime import timedelta
from typing import List, Optional

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

import modules.models as models
import modules.schemas as schemas
import utils
from iam.audit.service import IAMAuditService
from iam.deps import get_db, get_current_identity, verify_admin_aud

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mfa", tags=["mfa"])

MFA_TOKEN_EXPIRE_MINUTES = 5
MFA_ISSUER_NAME = "Enterprise Portal"
WEBAUTHN_CHALLENGE_TTL = 300  # 5 minutes


# ──────────────────────────── helpers ────────────────────────────

def _generate_qr_base64(uri: str) -> str:
    """Generate a QR code PNG as base64 string."""
    img = qrcode.make(uri, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _create_mfa_token(user: models.User, provider: str = "local") -> str:
    """Issue a short-lived JWT for MFA challenge (not usable as session)."""
    return utils.create_access_token(
        data={"sub": user.username, "uid": user.id, "provider": provider},
        expires_delta=timedelta(minutes=MFA_TOKEN_EXPIRE_MINUTES),
        audience="mfa_challenge",
    )


async def _get_system_mfa_config(db: AsyncSession) -> bool:
    """Check if system-level force MFA is enabled."""
    from sqlalchemy import select
    result = await db.execute(
        select(models.SystemConfig).filter(models.SystemConfig.key == "security_mfa_enabled")
    )
    config = result.scalars().first()
    return config is not None and str(config.value).lower() == "true"


async def _get_enabled_mfa_methods(user: models.User, db: AsyncSession) -> list[str]:
    from sqlalchemy import func, select

    methods: list[str] = []
    if bool(getattr(user, "totp_enabled", False)):
        methods.append("totp")
    if bool(getattr(user, "email_mfa_enabled", False)) and bool(getattr(user, "email", "")):
        methods.append("email")

    webauthn_count = await db.execute(
        select(func.count()).select_from(models.WebAuthnCredential).filter(
            models.WebAuthnCredential.user_id == user.id
        )
    )
    if (webauthn_count.scalar() or 0) > 0:
        methods.append("webauthn")
    return methods


async def _audit_mfa_action(
    *,
    db: AsyncSession,
    request: Request,
    user: models.User | None,
    action: str,
    result: str = "success",
    reason: str | None = None,
    detail: dict | None = None,
) -> None:
    try:
        await IAMAuditService.log(
            db=db,
            action=action,
            target_type="mfa",
            user_id=(user.id if user else None),
            username=(user.username if user else None),
            target_id=(user.id if user else None),
            target_name=(user.username if user else None),
            result=result,
            reason=reason,
            detail=detail or {},
            ip_address=(request.client.host if request.client else "unknown"),
            user_agent=request.headers.get("User-Agent"),
            trace_id=request.headers.get("X-Request-ID"),
        )
    except Exception:
        # best effort only
        logger.exception("Failed to write MFA audit event: %s", action)


async def _verify_sensitive_action_password(
    *,
    user: models.User,
    password: str,
    db: AsyncSession,
    request: Request,
) -> bool:
    if await utils.verify_password(password, user.hashed_password):
        return True

    auth_source = str(getattr(user, "auth_source", "local") or "local").strip().lower()
    if auth_source not in {"ldap", "ad"}:
        return False

    try:
        from modules.iam.services.identity.identity_service import ProviderIdentityService
        from modules.iam.services.identity.providers.base import IdentityProviderError

        provider = "ad" if auth_source == "ad" else "ldap"
        provider_impl = ProviderIdentityService._providers.get(provider)
        if provider_impl is None:
            return False
        directory = await ProviderIdentityService._get_enabled_directory(db, provider=provider)
        await provider_impl.authenticate(
            db=db,
            username=user.username,
            password=password,
            request=request,
            directory_config=directory,
        )
        return True
    except (HTTPException, IdentityProviderError, Exception):
        return False


def _raise_email_send_exception(exc: ValueError) -> None:
    message = str(exc)
    lowered = message.lower()
    if "频繁" in message or "too frequent" in lowered:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "EMAIL_OTP_RATE_LIMITED", "message": message},
        )
    if "smtp" in lowered or "未配置" in message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SMTP_NOT_CONFIGURED", "message": message},
        )
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "EMAIL_SEND_FAILED", "message": message},
    )


# ──────────────────────────── routes ────────────────────────────

@router.get("/status", response_model=schemas.MfaStatusResponse)
async def get_mfa_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get current user's MFA status."""
    user = await get_current_identity(request, db)
    methods = await _get_enabled_mfa_methods(user, db)
    return schemas.MfaStatusResponse(
        totp_enabled=("totp" in methods),
        email_mfa_enabled=("email" in methods),
        webauthn_enabled=("webauthn" in methods),
    )


@router.post("/setup", response_model=schemas.MfaSetupResponse)
async def setup_mfa(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Generate TOTP secret and QR code for binding."""
    user = await get_current_identity(request, db)
    if user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "MFA_ALREADY_ENABLED", "message": "TOTP is already enabled."},
        )

    secret = pyotp.random_base32()
    # Store secret temporarily (not yet activated)
    user.totp_secret = secret
    user.totp_enabled = False
    await db.commit()
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.totp.setup",
        detail={"status": "initialized"},
    )

    # Read app_name from system config for TOTP issuer
    from sqlalchemy import select
    config_result = await db.execute(
        select(models.SystemConfig).filter(models.SystemConfig.key == "app_name")
    )
    app_name_config = config_result.scalars().first()
    issuer = app_name_config.value if app_name_config and app_name_config.value else MFA_ISSUER_NAME

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.username, issuer_name=issuer)
    qr_b64 = _generate_qr_base64(uri)

    return schemas.MfaSetupResponse(
        secret=secret,
        qr_code=qr_b64,
        otpauth_uri=uri,
    )


@router.post("/verify-setup")
async def verify_mfa_setup(
    request: Request,
    payload: schemas.MfaVerifySetupRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify TOTP code during setup and activate MFA."""
    user = await get_current_identity(request, db)
    if user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "MFA_ALREADY_ENABLED", "message": "TOTP is already enabled."},
        )
    if not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MFA_NOT_SETUP", "message": "Please call /setup first."},
        )

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(payload.code, valid_window=1):
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.totp.verify_setup",
            result="fail",
            reason="INVALID_TOTP_CODE",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TOTP_CODE", "message": "Invalid verification code."},
        )

    user.totp_enabled = True
    await db.commit()
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.totp.verify_setup",
        detail={"status": "enabled"},
    )
    await db.commit()
    return {"message": "MFA enabled successfully"}


@router.delete("/")
async def disable_mfa(
    request: Request,
    payload: schemas.MfaDisableRequest,
    db: AsyncSession = Depends(get_db),
):
    """Disable TOTP MFA (requires password + current TOTP code)."""
    user = await get_current_identity(request, db)
    if not user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MFA_NOT_ENABLED", "message": "TOTP is not enabled."},
        )

    if not await _verify_sensitive_action_password(user=user, password=payload.password, db=db, request=request):
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.totp.disable",
            result="fail",
            reason="INVALID_PASSWORD",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_PASSWORD", "message": "密码错误"},
        )

    # Verify current TOTP code
    if not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MFA_NOT_CONFIGURED", "message": "TOTP secret not found."},
        )
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(payload.totp_code, valid_window=1):
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.totp.disable",
            result="fail",
            reason="INVALID_TOTP_CODE",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOTP_CODE", "message": "验证码错误或已过期"},
        )

    user.totp_secret = None
    user.totp_enabled = False
    await db.commit()
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.totp.disable",
    )
    await db.commit()
    return {"message": "MFA disabled successfully"}


@router.post("/verify")
async def verify_mfa_challenge(
    request: Request,
    response: Response,
    payload: schemas.MfaChallengeVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify TOTP code during login MFA challenge.
    Accepts mfa_token (from step-1 login) + totp_code, issues real session token.
    """
    from jose import jwt, JWTError

    # Decode the mfa_token
    try:
        token_data = jwt.decode(
            payload.mfa_token,
            utils.SECRET_KEY,
            algorithms=[utils.ALGORITHM],
            audience="mfa_challenge",
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_MFA_TOKEN", "message": "MFA token is invalid or expired."},
        )

    username = token_data.get("sub")
    user_id = token_data.get("uid")
    provider = token_data.get("provider", "local")
    if not username or not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_MFA_TOKEN", "message": "Invalid MFA token payload."},
        )

    # Get user
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(models.User)
        .filter(models.User.id == user_id, models.User.username == username)
        .options(selectinload(models.User.roles))
    )
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive."},
        )

    enabled_methods = await _get_enabled_mfa_methods(user, db)
    if not enabled_methods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MFA_NOT_CONFIGURED", "message": "MFA not configured for this user."},
        )

    verify_method = None

    # ── Branch: WebAuthn / TOTP / Email ──
    if payload.webauthn_response:
        if "webauthn" not in enabled_methods:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "MFA_METHOD_NOT_ENABLED", "message": "WebAuthn is not enabled for this user."},
            )
        # WebAuthn path
        await _verify_webauthn_for_login(user, payload.webauthn_response, db)
        verify_method = "webauthn"
    elif payload.totp_code:
        if "totp" not in enabled_methods:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "MFA_METHOD_NOT_ENABLED", "message": "TOTP is not enabled for this user."},
            )
        # TOTP path
        if not user.totp_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "MFA_NOT_CONFIGURED", "message": "TOTP not configured for this user."},
            )
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(payload.totp_code, valid_window=1):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOTP_CODE", "message": "Invalid TOTP code."},
            )
        verify_method = "totp"
    elif payload.email_code:
        if "email" not in enabled_methods:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "MFA_METHOD_NOT_ENABLED", "message": "Email MFA is not enabled for this user."},
            )
        from modules.iam.services.email_service import verify_email_otp

        if not await verify_email_otp(user.username, payload.email_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_EMAIL_CODE", "message": "Invalid email verification code."},
            )
        verify_method = "email"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "MFA_CODE_REQUIRED",
                "message": "Either totp_code, email_code or webauthn_response is required.",
            },
        )

    # Determine audience from provider
    audience = "admin" if provider == "admin" else "portal"
    cookie_name = "admin_session" if audience == "admin" else "portal_session"

    # Read session_timeout from system config
    configs_result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in configs_result.scalars().all()}
    session_timeout = int(configs.get("login_session_timeout_minutes", str(utils.ACCESS_TOKEN_EXPIRE_MINUTES)))
    session_timeout = max(5, min(session_timeout, 43200))
    session_timeout_seconds = session_timeout * 60

    # Revoke previous token if exists
    previous_token = request.cookies.get(cookie_name)
    if previous_token:
        from iam.identity.service import IdentityService as IAMIdentityService
        await IAMIdentityService._revoke_token(previous_token, db=db)

    # Issue real session token
    from datetime import datetime, timezone
    session_start_epoch = int(datetime.now(timezone.utc).timestamp())
    access_token = utils.create_access_token(
        data={"sub": user.username, "uid": user.id, "session_start": session_start_epoch},
        expires_delta=timedelta(minutes=session_timeout),
        audience=audience,
    )

    # Track active session
    try:
        from iam.identity.service import IdentityService as IAMIdentityService
        _, token_audience, new_jti, new_exp = await IAMIdentityService._extract_token_session_meta(
            access_token, db=db,
        )
        await IAMIdentityService._add_active_session(
            user_id=user.id,
            audience=token_audience or audience,
            jti=new_jti,
            exp_epoch=new_exp,
            session_timeout_minutes=session_timeout,
        )
    except Exception:
        pass

    # Set cookie
    response.set_cookie(
        key=cookie_name,
        value=access_token,
        httponly=True,
        max_age=session_timeout_seconds,
        expires=session_timeout_seconds,
        samesite=utils.COOKIE_SAMESITE,
        secure=utils.COOKIE_SECURE,
        domain=utils.COOKIE_DOMAIN,
        path="/",
    )

    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.challenge.verify",
        detail={"method": verify_method, "provider": provider, "audience": audience},
    )
    await db.commit()
    return {"message": "Login successful", "token_type": "bearer", "access_token": access_token, "provider": provider}


# ──────────────────────────── admin: batch reset MFA ────────────────────────────

from pydantic import BaseModel as _BaseModel
from typing import List as _List
from core.dependencies import PermissionChecker

class _BatchResetMfaRequest(_BaseModel):
    usernames: _List[str]

@router.post("/admin/batch-reset")
async def admin_batch_reset_mfa(
    payload: _BatchResetMfaRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _aud: models.User = Depends(verify_admin_aud),
    _current: models.User = Depends(PermissionChecker("sys:user:edit")),
):
    """Admin batch reset MFA for given usernames."""
    if not payload.usernames:
        return {"reset_count": 0}

    from sqlalchemy import select as _select
    result = await db.execute(
        _select(models.User).filter(models.User.username.in_(payload.usernames))
    )
    users = result.scalars().all()
    reset_count = 0
    for user in users:
        previous_totp = bool(user.totp_enabled or user.totp_secret)
        previous_email = bool(user.email_mfa_enabled)
        user.totp_secret = None
        user.totp_enabled = False
        user.email_mfa_enabled = False

        cred_result = await db.execute(
            _select(models.WebAuthnCredential).filter(models.WebAuthnCredential.user_id == user.id)
        )
        creds = cred_result.scalars().all()
        for cred in creds:
            await db.delete(cred)

        changed = previous_totp or previous_email or bool(creds)
        if changed:
            reset_count += 1
            await _audit_mfa_action(
                db=db,
                request=request,
                user=user,
                action="iam.mfa.admin.batch_reset",
                detail={
                    "operator": _current.username,
                    "totp_reset": previous_totp,
                    "email_reset": previous_email,
                    "webauthn_deleted": len(creds),
                },
            )
    await db.commit()
    return {"reset_count": reset_count}


# ──────────────────────────── Email MFA ────────────────────────────

@router.get("/email/status")
async def get_email_mfa_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get current user's email MFA status."""
    user = await get_current_identity(request, db)
    # Keep masked email for optional display, but return current user's real email
    # so the security center can show the bound account mailbox explicitly.
    email = user.email or ""
    if "@" in email:
        local, domain = email.split("@", 1)
        masked = local[:2] + "***@" + domain
    else:
        masked = email
    return {
        "email_mfa_enabled": bool(user.email_mfa_enabled),
        "email": email,
        "email_masked": masked,
        "has_email": bool(user.email),
    }


@router.post("/email/enable")
async def enable_email_mfa(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Enable email MFA for current user (requires email set)."""
    user = await get_current_identity(request, db)
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_EMAIL", "message": "账户未设置邮箱，请先绑定邮箱。"},
        )
    # Send a verification code first
    from modules.iam.services.email_service import send_email_otp
    try:
        await send_email_otp(user.email, user.username, db)
    except ValueError as e:
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.email.enable",
            result="fail",
            reason="EMAIL_SEND_FAILED",
            detail={"message": str(e)},
        )
        await db.commit()
        _raise_email_send_exception(e)
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.email.enable",
        detail={"status": "challenge_sent"},
    )
    await db.commit()
    return {"message": "验证码已发送到您的邮箱"}


@router.post("/email/verify-enable")
async def verify_enable_email_mfa(
    request: Request,
    payload: schemas.MfaVerifySetupRequest,  # reuse: has 'code' field
    db: AsyncSession = Depends(get_db),
):
    """Verify email OTP and enable email MFA."""
    user = await get_current_identity(request, db)
    from modules.iam.services.email_service import verify_email_otp
    if not await verify_email_otp(user.username, payload.code):
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.email.verify_enable",
            result="fail",
            reason="INVALID_CODE",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CODE", "message": "验证码错误或已过期"},
        )
    user.email_mfa_enabled = True
    await db.commit()
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.email.verify_enable",
        detail={"status": "enabled"},
    )
    await db.commit()
    return {"message": "邮箱验证已启用"}


@router.delete("/email")
async def disable_email_mfa(
    request: Request,
    payload: schemas.MfaDisableRequest,  # reuse: has 'password' field
    db: AsyncSession = Depends(get_db),
):
    """Disable email MFA (requires password)."""
    user = await get_current_identity(request, db)
    if not user.email_mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_MFA_NOT_ENABLED", "message": "邮箱验证未启用"},
        )
    if not await _verify_sensitive_action_password(user=user, password=payload.password, db=db, request=request):
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.email.disable",
            result="fail",
            reason="INVALID_PASSWORD",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_PASSWORD", "message": "密码错误"},
        )
    user.email_mfa_enabled = False
    await db.commit()
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.email.disable",
    )
    await db.commit()
    return {"message": "邮箱验证已关闭"}


@router.post("/email/send-code")
async def send_email_mfa_code(
    request: Request,
    mfa_token: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Send email OTP for MFA challenge during login (or resend)."""
    user: models.User | None = None
    if mfa_token:
        from jose import JWTError, jwt
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        try:
            token_data = jwt.decode(
                mfa_token,
                utils.SECRET_KEY,
                algorithms=[utils.ALGORITHM],
                audience="mfa_challenge",
            )
            username = token_data.get("sub")
            user_id = token_data.get("uid")
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_MFA_TOKEN", "message": "MFA token is invalid or expired."},
            )
        if not username or not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_MFA_TOKEN", "message": "Invalid MFA token payload."},
            )
        result = await db.execute(
            select(models.User)
            .filter(models.User.id == user_id, models.User.username == username)
            .options(selectinload(models.User.roles))
        )
        user = result.scalars().first()
    else:
        user = await get_current_identity(request, db)

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive."},
        )
    if not user.email or not user.email_mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMAIL_MFA_NOT_ENABLED", "message": "邮箱验证未启用"},
        )
    from modules.iam.services.email_service import send_email_otp
    try:
        await send_email_otp(user.email, user.username, db)
    except ValueError as e:
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.email.send_code",
            result="fail",
            reason="EMAIL_SEND_FAILED",
            detail={"message": str(e)},
        )
        await db.commit()
        _raise_email_send_exception(e)
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.email.send_code",
    )
    await db.commit()
    return {"message": "验证码已发送"}


# ──────────────────────────── WebAuthn helpers ────────────────────────────

async def _get_webauthn_rp(db: AsyncSession):
    """Get WebAuthn Relying Party config from system_config (平台设置)."""
    from sqlalchemy import select
    from urllib.parse import urlparse
    result = await db.execute(select(models.SystemConfig))
    configs = {c.key: c.value for c in result.scalars().all()}

    base_url = str(
        configs.get("platform_public_base_url")
        or configs.get("public_base_url")
        or ""
    ).strip()

    rp_name = str(configs.get("app_name") or "").strip() or MFA_ISSUER_NAME

    rp_id = str(configs.get("platform_domain") or "").strip().lower()
    if not rp_id and base_url:
        parsed = urlparse(base_url if "://" in base_url else f"https://{base_url}")
        rp_id = (parsed.hostname or "").strip().lower()
    if not rp_id:
        rp_id = "localhost"

    # Derive origin from public base URL (scheme + host + optional non-standard port)
    if base_url:
        parsed = urlparse(base_url if "://" in base_url else f"https://{base_url}")
        scheme = parsed.scheme or "https"
        host = (parsed.hostname or "").strip().lower() or rp_id
        origin = f"{scheme}://{host}"
        if parsed.port and parsed.port not in (80, 443):
            origin = f"{origin}:{parsed.port}"
    else:
        origin = f"https://{rp_id}"

    return rp_id, rp_name, origin


async def _verify_webauthn_for_login(
    user: models.User, webauthn_response: dict, db: AsyncSession
):
    """Verify a WebAuthn assertion during login MFA challenge."""
    try:
        from webauthn import verify_authentication_response
        from webauthn.helpers.structs import AuthenticationCredential
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "WEBAUTHN_NOT_AVAILABLE", "message": "WebAuthn 服务不可用"},
        ) from exc
    from infrastructure.cache_manager import cache

    # Retrieve stored challenge
    cache_key = f"webauthn:auth_challenge:{user.id}"
    stored = await cache.get(cache_key, is_json=True)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEBAUTHN_CHALLENGE_EXPIRED", "message": "Challenge expired, please try again."},
        )
    expected_challenge = base64.urlsafe_b64decode(stored["challenge"] + "==")
    expected_rp_id = stored["rp_id"]
    expected_origin = stored["origin"]

    # Find the credential in DB
    from sqlalchemy import select
    cred_id_b64 = webauthn_response.get("id", "")
    result = await db.execute(
        select(models.WebAuthnCredential).filter(
            models.WebAuthnCredential.credential_id == cred_id_b64,
            models.WebAuthnCredential.user_id == user.id,
        )
    )
    stored_cred = result.scalars().first()
    if not stored_cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WEBAUTHN_CREDENTIAL_NOT_FOUND", "message": "Security key not recognized."},
        )

    try:
        credential = AuthenticationCredential.model_validate(webauthn_response)
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=expected_rp_id,
            expected_origin=expected_origin,
            credential_public_key=base64.urlsafe_b64decode(stored_cred.public_key + "=="),
            credential_current_sign_count=stored_cred.sign_count,
        )
        # Update sign count
        stored_cred.sign_count = verification.new_sign_count
        await db.flush()
    except Exception as e:
        logger.warning("WebAuthn authentication failed for user %s: %s", user.id, e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WEBAUTHN_VERIFICATION_FAILED", "message": "Security key verification failed."},
        )
    finally:
        await cache.delete(cache_key)


# ──────────────────────────── WebAuthn routes ────────────────────────────

@router.get("/webauthn/status")
async def get_webauthn_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get current user's WebAuthn credentials list."""
    user = await get_current_identity(request, db)
    from sqlalchemy import select
    result = await db.execute(
        select(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.user_id == user.id)
        .order_by(models.WebAuthnCredential.created_at.desc())
    )
    creds = result.scalars().all()
    items = []
    for c in creds:
        transports = None
        if c.transports:
            try:
                transports = json.loads(c.transports)
            except (json.JSONDecodeError, TypeError):
                transports = None
        items.append(schemas.WebAuthnCredentialOut(
            id=c.id,
            name=c.name,
            created_at=c.created_at,
            transports=transports,
        ))
    return {"credentials": [item.model_dump() for item in items]}


@router.post("/webauthn/register/options")
async def webauthn_register_options(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Generate WebAuthn registration options (attestation challenge)."""
    try:
        from webauthn import generate_registration_options
        from webauthn.helpers import bytes_to_base64url
        from webauthn.helpers.structs import (
            PublicKeyCredentialDescriptor,
            AuthenticatorSelectionCriteria,
            ResidentKeyRequirement,
            UserVerificationRequirement,
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "WEBAUTHN_NOT_AVAILABLE", "message": "WebAuthn 服务不可用"},
        ) from exc
    from infrastructure.cache_manager import cache

    user = await get_current_identity(request, db)
    rp_id, rp_name, origin = await _get_webauthn_rp(db)

    # Gather existing credentials to exclude
    from sqlalchemy import select
    result = await db.execute(
        select(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.user_id == user.id)
    )
    existing_creds = result.scalars().all()
    exclude_credentials = [
        PublicKeyCredentialDescriptor(id=base64.urlsafe_b64decode(c.credential_id + "=="))
        for c in existing_creds
    ]

    try:
        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=rp_name,
            user_id=str(user.id).encode(),
            user_name=user.username,
            user_display_name=user.name or user.username,
            exclude_credentials=exclude_credentials,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.DISCOURAGED,
                user_verification=UserVerificationRequirement.DISCOURAGED,
            ),
        )
    except ValueError as exc:
        logger.warning(
            "WebAuthn register options config invalid: rp_id=%s rp_name=%s origin=%s error=%s",
            rp_id,
            rp_name,
            origin,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "WEBAUTHN_CONFIG_INVALID",
                "message": "WebAuthn 配置无效，请检查平台域名与系统名称配置",
            },
        ) from exc

    # Store challenge in cache
    challenge_b64 = bytes_to_base64url(options.challenge)
    cache_key = f"webauthn:reg_challenge:{user.id}"
    await cache.set(cache_key, {
        "challenge": challenge_b64,
        "rp_id": rp_id,
        "origin": origin,
    }, ttl=WEBAUTHN_CHALLENGE_TTL)

    # Serialize options to JSON-compatible dict
    from webauthn.helpers import options_to_json
    return Response(
        content=options_to_json(options),
        media_type="application/json",
    )


from pydantic import BaseModel as _PydanticBase


class _WebAuthnRegisterVerifyBody(_PydanticBase):
    credential: dict
    name: str = "Security Key"


@router.post("/webauthn/register/verify")
async def webauthn_register_verify(
    request: Request,
    payload: _WebAuthnRegisterVerifyBody,
    db: AsyncSession = Depends(get_db),
):
    """Verify WebAuthn registration response and save credential."""
    try:
        from webauthn import verify_registration_response
        from webauthn.helpers import bytes_to_base64url
        from webauthn.helpers.structs import RegistrationCredential
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "WEBAUTHN_NOT_AVAILABLE", "message": "WebAuthn 服务不可用"},
        ) from exc
    from infrastructure.cache_manager import cache

    user = await get_current_identity(request, db)

    cache_key = f"webauthn:reg_challenge:{user.id}"
    stored = await cache.get(cache_key, is_json=True)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEBAUTHN_CHALLENGE_EXPIRED", "message": "Registration challenge expired."},
        )

    expected_challenge = base64.urlsafe_b64decode(stored["challenge"] + "==")
    expected_rp_id = stored["rp_id"]
    expected_origin = stored["origin"]

    try:
        credential = RegistrationCredential.model_validate(payload.credential)
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=expected_rp_id,
            expected_origin=expected_origin,
        )
    except Exception as e:
        logger.warning("WebAuthn registration verification failed for user %s: %s", user.id, e)
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.webauthn.register",
            result="fail",
            reason="WEBAUTHN_REGISTRATION_FAILED",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WEBAUTHN_REGISTRATION_FAILED", "message": "Security key registration verification failed."},
        )
    finally:
        await cache.delete(cache_key)

    # Save credential
    transports_list = []
    if hasattr(credential, 'response') and hasattr(credential.response, 'transports'):
        transports_list = [str(t.value) if hasattr(t, 'value') else str(t)
                          for t in (credential.response.transports or [])]

    new_cred = models.WebAuthnCredential(
        user_id=user.id,
        credential_id=bytes_to_base64url(verification.credential_id),
        public_key=bytes_to_base64url(verification.credential_public_key),
        sign_count=verification.sign_count,
        name=payload.name[:128],
        transports=json.dumps(transports_list) if transports_list else None,
    )
    db.add(new_cred)
    await db.commit()
    await db.refresh(new_cred)
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.webauthn.register",
        detail={"credential_id": new_cred.id, "credential_name": new_cred.name},
    )
    await db.commit()

    return {
        "message": "Security key registered successfully",
        "credential": {
            "id": new_cred.id,
            "name": new_cred.name,
            "created_at": new_cred.created_at.isoformat() if new_cred.created_at else None,
        },
    }


@router.post("/webauthn/authenticate/options")
async def webauthn_authenticate_options(
    request: Request,
    db: AsyncSession = Depends(get_db),
    mfa_token: Optional[str] = None,
):
    """
    Generate WebAuthn authentication options.
    Can be called:
    - By authenticated user (e.g. from security settings for testing)
    - During login MFA challenge with mfa_token query param
    """
    try:
        from webauthn import generate_authentication_options
        from webauthn.helpers import bytes_to_base64url, options_to_json
        from webauthn.helpers.structs import PublicKeyCredentialDescriptor
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "WEBAUTHN_NOT_AVAILABLE", "message": "WebAuthn 服务不可用"},
        ) from exc
    from infrastructure.cache_manager import cache
    from sqlalchemy import select

    rp_id, rp_name, origin = await _get_webauthn_rp(db)

    # Determine user
    if mfa_token:
        # During login MFA challenge
        from jose import jwt, JWTError
        try:
            token_data = jwt.decode(
                mfa_token,
                utils.SECRET_KEY,
                algorithms=[utils.ALGORITHM],
                audience="mfa_challenge",
            )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_MFA_TOKEN", "message": "MFA token is invalid or expired."},
            )
        user_id = token_data.get("uid")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_MFA_TOKEN", "message": "Invalid MFA token payload."},
            )
    else:
        user = await get_current_identity(request, db)
        user_id = user.id

    # Get user's credentials
    result = await db.execute(
        select(models.WebAuthnCredential)
        .filter(models.WebAuthnCredential.user_id == user_id)
    )
    creds = result.scalars().all()
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_WEBAUTHN_CREDENTIALS", "message": "No security keys registered."},
        )

    allow_credentials = [
        PublicKeyCredentialDescriptor(id=base64.urlsafe_b64decode(c.credential_id + "=="))
        for c in creds
    ]

    try:
        options = generate_authentication_options(
            rp_id=rp_id,
            allow_credentials=allow_credentials,
        )
    except ValueError as exc:
        logger.warning(
            "WebAuthn auth options config invalid: rp_id=%s rp_name=%s origin=%s error=%s",
            rp_id,
            rp_name,
            origin,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "WEBAUTHN_CONFIG_INVALID",
                "message": "WebAuthn 配置无效，请检查平台域名与系统名称配置",
            },
        ) from exc

    # Store challenge
    challenge_b64 = bytes_to_base64url(options.challenge)
    cache_key = f"webauthn:auth_challenge:{user_id}"
    await cache.set(cache_key, {
        "challenge": challenge_b64,
        "rp_id": rp_id,
        "origin": origin,
    }, ttl=WEBAUTHN_CHALLENGE_TTL)

    return Response(
        content=options_to_json(options),
        media_type="application/json",
    )


@router.delete("/webauthn/{credential_id}")
async def delete_webauthn_credential(
    credential_id: int,
    request: Request,
    payload: schemas.WebAuthnDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete a WebAuthn credential (requires password verification)."""
    user = await get_current_identity(request, db)

    if not await _verify_sensitive_action_password(user=user, password=payload.password, db=db, request=request):
        await _audit_mfa_action(
            db=db,
            request=request,
            user=user,
            action="iam.mfa.webauthn.delete",
            result="fail",
            reason="INVALID_PASSWORD",
            detail={"credential_id": credential_id},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_PASSWORD", "message": "密码错误"},
        )

    from sqlalchemy import select
    result = await db.execute(
        select(models.WebAuthnCredential).filter(
            models.WebAuthnCredential.id == credential_id,
            models.WebAuthnCredential.user_id == user.id,
        )
    )
    cred = result.scalars().first()
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CREDENTIAL_NOT_FOUND", "message": "Security key not found."},
        )

    await db.delete(cred)
    await db.commit()
    await _audit_mfa_action(
        db=db,
        request=request,
        user=user,
        action="iam.mfa.webauthn.delete",
        detail={"credential_id": credential_id, "credential_name": cred.name},
    )
    await db.commit()
    return {"message": "Security key deleted successfully"}
