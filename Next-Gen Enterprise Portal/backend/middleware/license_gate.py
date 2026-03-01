import logging
from typing import Any, Awaitable, Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

import database
from services.license_service import LicenseService

logger = logging.getLogger(__name__)


PolicyProvider = Callable[[Request], Awaitable[dict[str, Any]]]


class LicenseGateMiddleware(BaseHTTPMiddleware):
    """
    Enforce global runtime license access policy:
    - no license / invalid / not-yet-valid => blocked (only auth/public/license endpoints)
    - expired => read-only (GET/HEAD/OPTIONS allowed)
    """

    EXEMPT_EXACT_PATHS = {
        "/api/iam/auth/portal/token",
        "/api/iam/auth/admin/token",
        "/api/iam/auth/logout",
        "/api/iam/auth/logout-all",
        "/api/iam/auth/me",
        "/api/system/session/ping",
        # Keep system version/info readable for logged-in operators even before license install.
        "/api/admin/system/info",
        "/api/admin/system/version",
    }

    EXEMPT_PREFIXES = (
        "/api/public/",
        "/api/captcha/",
        "/api/system/license/",
        "/api/admin/system/license/",
    )

    READ_ONLY_METHODS = {"GET", "HEAD", "OPTIONS"}

    def __init__(
        self,
        app: ASGIApp,
        policy_provider: Optional[PolicyProvider] = None,
    ):
        super().__init__(app)
        self._policy_provider = policy_provider or self._resolve_policy

    @classmethod
    def _normalize_path(cls, path: str) -> str:
        text = (path or "").strip()
        if not text:
            return "/"
        if text == "/":
            return text
        return text.rstrip("/")

    @classmethod
    def _is_exempt(cls, path: str) -> bool:
        normalized = cls._normalize_path(path)
        if normalized in cls.EXEMPT_EXACT_PATHS:
            return True
        return any(normalized.startswith(prefix) for prefix in cls.EXEMPT_PREFIXES)

    @classmethod
    def _should_check(cls, path: str) -> bool:
        normalized = cls._normalize_path(path)
        if not normalized.startswith("/api/"):
            return False
        if cls._is_exempt(normalized):
            return False
        return True

    async def _resolve_policy(self, request: Request) -> dict[str, Any]:
        async with database.SessionLocal() as db:
            return await LicenseService.get_access_policy(db=db, request=request)

    async def dispatch(self, request: Request, call_next):
        if not self._should_check(request.url.path):
            return await call_next(request)

        try:
            policy = await self._policy_provider(request)
        except Exception as e:
            logger.exception("License gate policy check failed: %s", e)
            return JSONResponse(
                status_code=503,
                content={
                    "detail": {
                        "code": "LICENSE_CHECK_FAILED",
                        "message": "授权状态检查失败，请稍后重试。",
                    }
                },
            )

        mode = (policy or {}).get("mode")
        if mode == "full":
            return await call_next(request)

        if mode == "read_only":
            if request.method.upper() in self.READ_ONLY_METHODS:
                return await call_next(request)
            return JSONResponse(
                status_code=403,
                content={
                    "detail": {
                        "code": LicenseService.CODE_READ_ONLY,
                        "reason": (policy or {}).get("reason", LicenseService.CODE_EXPIRED),
                        "mode": "read_only",
                        "message": (policy or {}).get("message") or "授权已到期，系统当前仅允许只读访问。",
                    }
                },
            )

        return JSONResponse(
            status_code=403,
            content={
                "detail": {
                    "code": LicenseService.CODE_LICENSE_REQUIRED,
                    "reason": (policy or {}).get("reason", LicenseService.CODE_MISSING),
                    "mode": "blocked",
                    "message": (policy or {}).get("message") or "系统未安装有效授权，当前仅可访问授权许可功能。",
                }
            },
        )
