import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import User
from app.services.activity_service import log_activity


async def create_project(
    db: AsyncSession, *, user: User, name: str, description: str | None
) -> Project:
    project = Project(name=name.strip(), description=description, created_by=user.id)
    db.add(project)
    await db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=user.id, role=ProjectRole.OWNER))
    await log_activity(
        db,
        project_id=project.id,
        actor_id=user.id,
        event_type="project.created",
        metadata={"name": name},
    )
    await db.commit()
    await db.refresh(project)
    return project


async def list_user_projects(db: AsyncSession, *, user_id: uuid.UUID) -> list[tuple[Project, ProjectRole]]:
    result = await db.execute(
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
        .order_by(Project.created_at.desc())
    )
    return list(result.all())


async def get_project(db: AsyncSession, project_id: uuid.UUID) -> Project | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    return result.scalar_one_or_none()


async def update_project(
    db: AsyncSession, *, project: Project, name: str | None, description: str | None
) -> Project:
    if name is not None:
        project.name = name.strip()
    if description is not None:
        project.description = description
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, *, project: Project) -> None:
    await db.delete(project)
    await db.commit()
