from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession


class IdentityProviderError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(slots=True)
class IdentityAuthOrgResult:
    provider: str
    external_id: str
    name: str
    parent_external_id: Optional[str] = None
    dn: Optional[str] = None
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class IdentityAuthGroupResult:
    provider: str
    external_id: str
    name: str
    description: Optional[str] = None
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class IdentityAuthResult:
    provider: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    external_id: Optional[str] = None
    user_dn: Optional[str] = None
    department_external_ids: list[str] = field(default_factory=list)
    attributes: dict[str, Any] = field(default_factory=dict)


class IdentityProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    async def authenticate(
        self,
        *,
        db: AsyncSession,
        username: str,
        password: str,
        request: Any | None = None,
        directory_config: Any | None = None,
    ) -> IdentityAuthResult:
        raise NotImplementedError

    @abstractmethod
    async def test_connection(
        self,
        *,
        db: AsyncSession,
        directory_config: Any,
        username: str | None = None,
        password: str | None = None,
        request: Any | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def health_check(
        self,
        *,
        db: AsyncSession,
        directory_config: Any | None = None,
    ) -> dict[str, Any]:
        return {"provider": self.provider_name, "ok": True}

    async def sync_users(
        self,
        *,
        db: AsyncSession,
        directory_config: Any,
        limit: int = 1000,
        sync_cursor: str | None = None,
        request: Any | None = None,
    ) -> tuple[list[IdentityAuthResult], str | None]:
        raise IdentityProviderError(
            code="PROVIDER_SYNC_NOT_SUPPORTED",
            message=f"{self.provider_name} provider does not support directory user sync",
            status_code=400,
        )

    async def sync_orgs(
        self,
        *,
        db: AsyncSession,
        directory_config: Any,
        limit: int = 1000,
        sync_cursor: str | None = None,
        request: Any | None = None,
    ) -> tuple[list[IdentityAuthOrgResult], str | None]:
        return [], None

    async def sync_groups(
        self,
        *,
        db: AsyncSession,
        directory_config: Any,
        limit: int = 1000,
        sync_cursor: str | None = None,
        request: Any | None = None,
    ) -> tuple[list[IdentityAuthGroupResult], str | None]:
        return [], None
