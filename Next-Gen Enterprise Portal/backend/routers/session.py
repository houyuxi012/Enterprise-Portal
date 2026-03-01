from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from iam.identity.schemas import SessionPingResponse
from iam.identity.service import IdentityService

router = APIRouter(
    prefix="/system/session",
    tags=["session"],
)


@router.post("/ping", response_model=SessionPingResponse)
async def session_ping(
    request: Request,
    response: Response,
    audience: str | None = Query(default=None, pattern="^(admin|portal)$"),
    db: AsyncSession = Depends(get_db),
):
    return await IdentityService.session_ping(
        request=request,
        response=response,
        db=db,
        audience=audience,
    )
