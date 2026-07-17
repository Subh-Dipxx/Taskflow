import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.project_access import EffectiveRole, ProjectAccessResult, require_project_access
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.member import ChangeRoleRequest, InviteMemberRequest, MemberResponse
from app.services import membership_service

router = APIRouter(prefix="/projects/{project_id}/members", tags=["members"])


@router.get("", response_model=list[MemberResponse])
async def list_members(
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    rows = await membership_service.list_members(db, project_id=access.project.id)
    return [
        MemberResponse(
            user_id=m.user_id,
            name=u.name,
            email=u.email,
            role=m.role,
            joined_at=m.joined_at,
        )
        for m, u in rows
    ]


@router.post("", response_model=MemberResponse)
async def invite_member(
    body: InviteMemberRequest,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.OWNER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load the user BEFORE calling the service (which commits the session).
    user_result = await db.execute(
        select(User).where(User.email == str(body.email).lower())
    )
    user = user_result.scalar_one_or_none()

    member = await membership_service.invite_member(
        db, project_id=access.project.id, email=body.email, actor_id=current_user.id
    )
    # If the user lookup failed, the service already raised a 404 — so
    # user is guaranteed non-None here.
    return MemberResponse(
        user_id=member.user_id,
        name=user.name if user else "",
        email=user.email if user else body.email,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.patch("/{user_id}", response_model=MemberResponse)
async def change_member_role(
    user_id: uuid.UUID,
    body: ChangeRoleRequest,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.OWNER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load the target user BEFORE calling the service (which commits the session).
    row = await db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(
            ProjectMember.project_id == access.project.id,
            ProjectMember.user_id == user_id,
        )
    )
    pair = row.one_or_none()

    member = await membership_service.change_role(
        db,
        project_id=access.project.id,
        target_user_id=user_id,
        new_role=body.role,
        actor_id=current_user.id,
    )
    # pair is guaranteed non-None; service raised 404 if member didn't exist.
    _, user = pair  # type: ignore[misc]
    return MemberResponse(
        user_id=member.user_id,
        name=user.name,
        email=user.email,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.delete("/{user_id}")
async def remove_member(
    user_id: uuid.UUID,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.OWNER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await membership_service.remove_member(
        db, project_id=access.project.id, target_user_id=user_id, actor_id=current_user.id
    )
    return {"ok": True}
