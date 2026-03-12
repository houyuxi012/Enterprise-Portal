from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
import modules.models as models
from core import security
import modules.schemas as schemas
from sqlalchemy import select
from datetime import timedelta
import jwt
from application.iam_app import AuditService, IdentityService

router = APIRouter(prefix="/auth", tags=["auth"], deprecated=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/iam/auth/portal/token")


@router.post("/token")
async def login_for_access_token(
    request: Request,
    response: Response, 
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    # Delegate to unified IAM service
    return await IdentityService.login(request, response, form_data, db)

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    return await IdentityService.logout(response, request=request, db=db)

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    from iam.deps import get_current_identity
    return await get_current_identity(request, db)
