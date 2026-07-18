import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task
from app.models.user import User
from app.services.activity_service import log_activity
from app.websocket.manager import manager


async def _get_member_ids(db: AsyncSession, project_id: uuid.UUID) -> set[uuid.UUID]:
    """Load the set of project member user_ids BEFORE committing so they can
    be used for WS broadcasts after the session is closed."""
    result = await db.execute(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)
    )
    return set(result.scalars().all())


async def _broadcast(
    member_ids: set[uuid.UUID],
    *,
    project_id: uuid.UUID,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Broadcast directly to a pre-computed set of user IDs (no DB needed)."""
    await manager.send_to_users(
        member_ids,
        {"type": event_type, "project_id": str(project_id), **payload},
    )


async def list_members(
    db: AsyncSession, *, project_id: uuid.UUID
) -> list[tuple[ProjectMember, User]]:
    result = await db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at)
    )
    return list(result.all())


async def invite_member(
    db: AsyncSession, *, project_id: uuid.UUID, email: str, actor_id: uuid.UUID
) -> ProjectMember:
    user_result = await db.execute(select(User).where(User.email == email.lower()))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found with that email")

    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="User is already a member")

    member = ProjectMember(project_id=project_id, user_id=user.id, role=ProjectRole.MEMBER)
    db.add(member)
    await db.flush()

    activity = await log_activity(
        db,
        project_id=project_id,
        actor_id=actor_id,
        event_type="member.invited",
        metadata={"user_id": str(user.id), "email": user.email, "user_name": user.name},
    )

    # Snapshot member IDs (including the new member) BEFORE commit so we
    # can broadcast without touching the expired session afterwards.
    member_ids = await _get_member_ids(db, project_id)

    await db.commit()
    await db.refresh(member)

    # Broadcast after commit — session is no longer needed.
    await _broadcast(
        member_ids,
        project_id=project_id,
        event_type="member.invited",
        payload={"user_id": str(user.id), "email": user.email},
    )
    await _broadcast(
        member_ids,
        project_id=project_id,
        event_type="activity.new",
        payload={
            "activity": {
                "id": str(activity.id),
                "event_type": activity.event_type,
                "actor_id": str(actor_id),
                "metadata": activity.event_metadata,
            }
        },
    )
    return member


async def change_role(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: ProjectRole,
    actor_id: uuid.UUID,
) -> ProjectMember:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Block demoting the owner without first promoting someone else.
    if member.role == ProjectRole.OWNER and new_role != ProjectRole.OWNER:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote the owner directly; promote another member to owner first",
        )

    # Ownership transfer: atomically demote the current owner in the same
    # flush so the partial unique index (one owner per project) never sees
    # two owner rows at once.
    if new_role == ProjectRole.OWNER and member.role != ProjectRole.OWNER:
        current_owner_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.role == ProjectRole.OWNER,
            )
        )
        current_owner = current_owner_result.scalar_one_or_none()
        if current_owner is not None:
            current_owner.role = ProjectRole.MEMBER

    member.role = new_role
    activity = await log_activity(
        db,
        project_id=project_id,
        actor_id=actor_id,
        event_type="member.role_changed",
        metadata={"user_id": str(target_user_id), "new_role": new_role.value},
    )

    member_ids = await _get_member_ids(db, project_id)

    await db.flush()
    await db.commit()
    await db.refresh(member)

    await _broadcast(
        member_ids,
        project_id=project_id,
        event_type="activity.new",
        payload={
            "activity": {
                "id": str(activity.id),
                "event_type": activity.event_type,
                "actor_id": str(actor_id),
                "metadata": activity.event_metadata,
            }
        },
    )
    return member


async def remove_member(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    target_user_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.role == ProjectRole.OWNER:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Transfer ownership before removing the current owner",
        )

    # Auto-unassign tasks before deleting the membership row.
    await db.execute(
        update(Task)
        .where(Task.project_id == project_id, Task.assignee_id == target_user_id)
        .values(assignee_id=None)
    )
    await db.delete(member)

    activity = await log_activity(
        db,
        project_id=project_id,
        actor_id=actor_id,
        event_type="member.removed",
        metadata={"user_id": str(target_user_id)},
    )

    # Snapshot member IDs BEFORE commit (removed user is already deleted from
    # the set via db.delete above, so they won't receive their own eviction).
    member_ids = await _get_member_ids(db, project_id)
    # Include the removed user so their other open tabs can redirect out.
    member_ids.add(target_user_id)

    await db.commit()

    await _broadcast(
        member_ids,
        project_id=project_id,
        event_type="member.removed",
        payload={"user_id": str(target_user_id)},
    )
    await _broadcast(
        member_ids,
        project_id=project_id,
        event_type="activity.new",
        payload={
            "activity": {
                "id": str(activity.id),
                "event_type": activity.event_type,
                "actor_id": str(actor_id),
                "metadata": activity.event_metadata,
            }
        },
    )
