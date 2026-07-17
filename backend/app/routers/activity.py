from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.project_access import EffectiveRole, ProjectAccessResult, require_project_access
from app.schemas.dashboard import ActivityListResponse, ActivityResponse, DashboardResponse
from app.services import dashboard_service

router = APIRouter(tags=["activity"])


@router.get("/projects/{project_id}/activity", response_model=ActivityListResponse)
async def project_activity(
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    rows, total = await dashboard_service.get_project_activity(
        db, project_id=access.project.id, page=page, page_size=page_size
    )
    return ActivityListResponse(
        items=[
            ActivityResponse(
                id=log.id,
                project_id=log.project_id,
                actor_id=log.actor_id,
                actor_name=user.name,
                event_type=log.event_type,
                task_id=log.task_id,
                event_metadata=log.event_metadata,
                created_at=log.created_at,
            )
            for log, user in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    data = await dashboard_service.get_dashboard(db, user_id=current_user.id)
    return DashboardResponse(**data)
