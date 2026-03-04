from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from iam.identity.schemas import SessionPingResponse
from iam.identity.service import IdentityService
from modules.admin.services.license_service import LicenseService

router = APIRouter(
    prefix="/system/session",
    tags=["session"],
)


async def _require_session_security_feature(
    db: AsyncSession = Depends(get_db),
) -> None:
    await LicenseService.require_feature(db, "session.security")


@router.post("/ping", response_model=SessionPingResponse)
async def session_ping(
    request: Request,
    response: Response,
    audience: str | None = Query(default=None, pattern="^(admin|portal)$"),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_session_security_feature),
):
    return await IdentityService.session_ping(
        request=request,
        response=response,
        db=db,
        audience=audience,
    )
