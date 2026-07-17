import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.project_access import EffectiveRole, ProjectAccessResult, require_project_access
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await project_service.create_project(
        db, user=current_user, name=body.name, description=body.description
    )
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_by=project.created_by,
        created_at=project.created_at,
        role="owner",
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await project_service.list_user_projects(db, user_id=current_user.id)
    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            created_by=p.created_by,
            created_at=p.created_at,
            role=role,
        )
        for p, role in rows
    ]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
):
    return ProjectResponse(
        id=access.project.id,
        name=access.project.name,
        description=access.project.description,
        created_by=access.project.created_by,
        created_at=access.project.created_at,
        role="owner" if access.effective_role == EffectiveRole.OWNER else "member",
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    body: ProjectUpdate,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(
        db, project=access.project, name=body.name, description=body.description
    )
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_by=project.created_by,
        created_at=project.created_at,
        role="owner",
    )


@router.delete("/{project_id}")
async def delete_project(
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.OWNER)),
    db: AsyncSession = Depends(get_db),
):
    await project_service.delete_project(db, project=access.project)
    return {"ok": True}
