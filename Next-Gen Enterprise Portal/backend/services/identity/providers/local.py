from __future__ import annotations

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models
import utils
from iam.identity.service import IdentityService
from services.identity.providers.base import IdentityAuthResult, IdentityProvider, IdentityProviderError


class LocalIdentityProvider(IdentityProvider):
    provider_name = "local"

    async def authenticate(
        self,
        *,
        db: AsyncSession,
        username: str,
        password: str,
        request=None,
        directory_config=None,
    ) -> IdentityAuthResult:
        result = await db.execute(
            select(models.User)
            .filter(models.User.username == username)
            .options(selectinload(models.User.roles).selectinload(models.Role.permissions))
        )
        user = result.scalars().first()
        if not user or not await utils.verify_password(password, user.hashed_password):
            raise IdentityProviderError(
                code="INVALID_CREDENTIALS",
                message="Incorrect username or password",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            raise IdentityProviderError(
                code="ACCOUNT_DISABLED",
                message="Account is disabled.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        if not IdentityService._can_login_portal(user):
            raise IdentityProviderError(
                code="PORTAL_ACCOUNT_REQUIRED",
                message="Access denied: PORTAL account required.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
        return IdentityAuthResult(
            provider=self.provider_name,
            username=user.username,
            email=user.email,
            display_name=user.name,
            external_id=str(user.id),
            attributes={"user_id": user.id},
        )

    async def test_connection(
        self,
        *,
        db: AsyncSession,
        directory_config,
        username: str | None = None,
        password: str | None = None,
        request=None,
    ) -> dict[str, str]:
        return {"success": True, "message": "Local provider is healthy"}

