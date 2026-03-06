from typing import Dict, Literal, Set

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from application.iam_app import LicenseService, generate_file_token, resolve_file_token, storage
import core.database as database
import modules.models as models
from modules.iam.services.privacy_consent import (
    load_privacy_policy_snapshot,
    load_public_privacy_config,
)

router = APIRouter(prefix="/public", tags=["public"])

# Public-safe configuration keys for pre-login screens and portal branding.
PUBLIC_CONFIG_KEYS: Set[str] = {
    "app_name",
    "logo_url",
    "footer_text",
    "browser_title",
    "favicon_url",
    "privacy_policy",
    "privacy_policy_required",
    "privacy_policy_version",
    "ai_name",
    "ai_icon",
    "ai_enabled",
    "search_ai_enabled",
    "kb_enabled",
    "default_ai_model",
}

# Config keys whose values may contain file tokens accessible without login.
_FILE_BEARING_CONFIG_KEYS: Set[str] = {"logo_url", "favicon_url", "ai_icon"}


class PrivacyConsentRequest(BaseModel):
    audience: Literal["portal", "admin"] = "portal"
    locale: str | None = Field(default=None, max_length=16)
    accepted: bool = True


@router.get("/config", response_model=Dict[str, str])
async def get_public_config(
    db: AsyncSession = Depends(database.get_db),
):
    result = await db.execute(
        select(models.SystemConfig).where(models.SystemConfig.key.in_(PUBLIC_CONFIG_KEYS))
    )
    configs = result.scalars().all()
    payload = {c.key: c.value for c in configs}

    # Rewrite file proxy URLs to public (no-auth) path for login/branding screens
    _PUBLIC_FILE_PREFIX = "/api/files/"
    _PUBLIC_REWRITE_PREFIX = "/api/public/files/"
    for key in _FILE_BEARING_CONFIG_KEYS:
        val = payload.get(key, "")
        if val and val.startswith(_PUBLIC_FILE_PREFIX):
            payload[key] = _PUBLIC_REWRITE_PREFIX + val[len(_PUBLIC_FILE_PREFIX):]

    # Expose tenant/customer display name from current license for portal copy.
    state = await LicenseService.get_current_state(db)
    customer_name = str((state or {}).get("customer") or "").strip()
    if customer_name and customer_name != "-":
        payload["customer_name"] = customer_name

    payload.update(await load_public_privacy_config(db))
    return payload


@router.post("/privacy/consents")
async def record_privacy_consent(
    _: PrivacyConsentRequest,
    __: Request,
    db: AsyncSession = Depends(database.get_db),
):
    snapshot = await load_privacy_policy_snapshot(db)
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "code": "PRIVACY_CONSENT_AUTH_BOUND_REQUIRED",
            "message": "匿名隐私同意记录已停用，请在登录请求中提交并完成当前政策版本的同意。",
            "policy_version": snapshot.version,
            "policy_hash": snapshot.policy_hash,
            "policy_required": snapshot.required,
        },
    )





def _iter_stream(response, chunk_size: int = 64 * 1024):
    """Yield chunks then close the underlying connection."""
    try:
        while True:
            data = response.read(chunk_size)
            if not data:
                break
            yield data
    finally:
        response.close()
        response.release_conn()


@router.get("/files/{token}")
async def public_file_proxy(
    token: str,
    db: AsyncSession = Depends(database.get_db),
):
    """Serve a file **without authentication**, but ONLY if the token
    corresponds to a URL currently stored in one of the public-safe
    system_config keys (logo_url, favicon_url, ai_icon).

    This prevents abuse: an attacker cannot use this endpoint to
    download arbitrary uploaded files — only the few explicitly
    published by the admin for the login/branding screens.
    """
    # 1. Verify the HMAC token is structurally valid
    real_filename = resolve_file_token(token)
    if not real_filename:
        raise HTTPException(status_code=404, detail="File not found")

    # 2. Whitelist check: the exact proxy URL must be stored in system_config
    expected_token = generate_file_token(real_filename)
    expected_url = f"/api/files/{expected_token}"

    result = await db.execute(
        select(models.SystemConfig).where(
            models.SystemConfig.key.in_(_FILE_BEARING_CONFIG_KEYS)
        )
    )
    allowed_urls = {c.value for c in result.scalars().all() if c.value}

    if expected_url not in allowed_urls:
        raise HTTPException(status_code=404, detail="File not found")

    # 3. Stream the file
    stream, content_type, content_length = storage.get_object_stream(real_filename)
    if stream is None:
        raise HTTPException(status_code=404, detail="File not found in storage")

    headers: dict[str, str] = {}
    if content_length:
        headers["Content-Length"] = str(content_length)
    headers["Cache-Control"] = "public, max-age=3600, immutable"

    return StreamingResponse(
        _iter_stream(stream),
        media_type=content_type,
        headers=headers,
    )
