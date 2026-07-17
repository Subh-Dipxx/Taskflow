import uuid
from enum import IntEnum

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import User


class EffectiveRole(IntEnum):
    MEMBER = 1
    OWNER = 2


def _to_effective(role: ProjectRole) -> EffectiveRole:
    return EffectiveRole.OWNER if role == ProjectRole.OWNER else EffectiveRole.MEMBER


class ProjectAccessResult:
    def __init__(self, project: Project, effective_role: EffectiveRole):
        self.project = project
        self.effective_role = effective_role


def require_project_access(min_role: EffectiveRole):
    async def _dependency(
        project_id: uuid.UUID,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> ProjectAccessResult:
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if project is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
            )
        )
        member = member_result.scalar_one_or_none()
        if member is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

        effective = _to_effective(member.role)
        if effective < min_role:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"This action requires {min_role.name.lower()} access; you have {effective.name.lower()}",
            )
        return ProjectAccessResult(project=project, effective_role=effective)

    return _dependency


def require_project_owner():
    return require_project_access(EffectiveRole.OWNER)
