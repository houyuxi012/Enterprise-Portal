from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
import models, utils, schemas
from sqlalchemy import select
from datetime import timedelta
from jose import JWTError, jwt
from services.audit_service import AuditService
from services.crypto_service import CryptoService

router = APIRouter(prefix="/auth", tags=["auth"], deprecated=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


@router.post("/token")
async def login_for_access_token(
    request: Request,
    response: Response, 
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    from iam.identity.service import IdentityService
    # Delegate to unified IAM service
    return await IdentityService.login(request, response, form_data, db)

@router.post("/logout")
async def logout(response: Response):
    from iam.identity.service import IdentityService
    return await IdentityService.logout(response)

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    from iam.identity.service import IdentityService
    return await IdentityService.get_current_user(request, db)
