import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.config import settings
from app.models.refresh_token import RefreshToken
from app.models.user import User


async def signup(db: AsyncSession, *, name: str, email: str, password: str) -> User:
    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    user = User(name=name.strip(), email=email.lower(), password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login(db: AsyncSession, *, email: str, password: str) -> tuple[User, str, str]:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    access_token = create_access_token(user.id)
    refresh_token = await _issue_refresh_token(db, user.id)
    await db.commit()
    return user, access_token, refresh_token


async def _issue_refresh_token(db: AsyncSession, user_id: uuid.UUID) -> str:
    raw = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_refresh_token(raw),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
            revoked=False,
        )
    )
    await db.flush()
    return raw


async def refresh_tokens(db: AsyncSession, *, raw_refresh_token: str) -> tuple[str, str]:
    token_hash = hash_refresh_token(raw_refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()
    if record is None or record.revoked or record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid or expired")
    record.revoked = True
    new_access = create_access_token(record.user_id)
    new_refresh = await _issue_refresh_token(db, record.user_id)
    await db.commit()
    return new_access, new_refresh


async def logout(db: AsyncSession, *, raw_refresh_token: str | None) -> None:
    if not raw_refresh_token:
        return
    token_hash = hash_refresh_token(raw_refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    record = result.scalar_one_or_none()
    if record:
        record.revoked = True
        await db.commit()
