from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import REFRESH_COOKIE_NAME, create_access_token
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse, UserResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=int(timedelta(days=settings.refresh_token_expire_days).total_seconds()),
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/auth")


@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await auth_service.signup(db, name=body.name, email=body.email, password=body.password)
    access = create_access_token(user.id)
    refresh = await auth_service._issue_refresh_token(db, user.id)
    await db.commit()
    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    _, access, refresh = await auth_service.login(db, email=body.email, password=body.password)
    _set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    access, new_refresh = await auth_service.refresh_tokens(db, raw_refresh_token=token)
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=access)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    await auth_service.logout(db, raw_refresh_token=token)
    _clear_refresh_cookie(response)
    return {"ok": True}
