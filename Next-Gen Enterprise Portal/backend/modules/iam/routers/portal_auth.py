from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from application.iam_app import ProviderIdentityService
import modules.schemas as schemas
from iam.deps import get_db

router = APIRouter(prefix="/portal/auth", tags=["portal-auth"])


def _parse_portal_auth_payload(raw_payload: dict) -> schemas.PortalAuthTokenRequest:
    try:
        return schemas.PortalAuthTokenRequest(**raw_payload)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_REQUEST",
                "message": "Invalid portal auth request payload.",
                "errors": e.errors(),
            },
        )


@router.post("/token", response_model=schemas.PortalAuthTokenResponse)
async def create_portal_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        try:
            payload_data = await request.json()
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_JSON", "message": "Request body must be valid JSON"},
            )
        payload = _parse_portal_auth_payload(payload_data if isinstance(payload_data, dict) else {})
    else:
        form = await request.form()
        payload = _parse_portal_auth_payload(
            {
                "username": str(form.get("username") or "").strip(),
                "password": str(form.get("password") or ""),
                "provider": str(form.get("provider") or "ldap").strip().lower(),
            }
        )

    if not payload.username or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_REQUEST", "message": "username and password are required"},
        )

    result = await ProviderIdentityService.authenticate_portal(
        db=db,
        request=request,
        response=response,
        username=payload.username,
        password=payload.password,
        provider=payload.provider,
    )
    return schemas.PortalAuthTokenResponse(**result)
