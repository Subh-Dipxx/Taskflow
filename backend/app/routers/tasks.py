import math
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.project_access import EffectiveRole, ProjectAccessResult, require_project_access
from app.models.task import TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskListResponse, TaskResponse, TaskUpdate, UserBrief
from app.services import task_service

router = APIRouter(tags=["tasks"])


def _task_response(task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        assignee_id=task.assignee_id,
        assignee=UserBrief.model_validate(task.assignee) if task.assignee else None,
        created_by=task.created_by,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse)
async def create_task(
    body: TaskCreate,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await task_service.create_task(
        db,
        project_id=access.project.id,
        created_by=current_user,
        title=body.title,
        description=body.description,
        status=body.status,
        priority=body.priority,
        due_date=body.due_date,
        assignee_id=body.assignee_id,
    )
    return _task_response(task)


@router.get("/projects/{project_id}/tasks", response_model=TaskListResponse)
async def list_tasks(
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    status: TaskStatus | None = None,
    assignee_id: uuid.UUID | None = None,
    priority: TaskPriority | None = None,
    search: str | None = None,
    sort_by: str = Query("created_at", pattern="^(priority|due_date|created_at)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
):
    items, total = await task_service.list_tasks(
        db,
        project_id=access.project.id,
        page=page,
        page_size=page_size,
        status_filter=status,
        assignee_id=assignee_id,
        priority=priority,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return TaskListResponse(
        items=[_task_response(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)) if total else 1,
    )


@router.get("/projects/{project_id}/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service._load_task(db, task_id, access.project.id)
    return _task_response(task)


@router.patch("/projects/{project_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await task_service._load_task(db, task_id, access.project.id)
    updated = await task_service.update_task(
        db,
        task=task,
        project_id=access.project.id,
        actor=current_user,
        actor_effective_role=access.effective_role,
        title=body.title,
        description=body.description,
        new_status=body.status,
        priority=body.priority,
        due_date=body.due_date,
        new_assignee_id=body.assignee_id if "assignee_id" in body.model_fields_set else ...,
    )
    return _task_response(updated)


@router.delete("/projects/{project_id}/tasks/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await task_service._load_task(db, task_id, access.project.id)
    await task_service.delete_task(db, task=task, project_id=access.project.id, actor_id=current_user.id)
    return {"ok": True}


@router.get("/me/assigned-tasks", response_model=list[TaskResponse])
async def assigned_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tasks = await task_service.get_assigned_tasks(db, user_id=current_user.id)
    return [_task_response(t) for t in tasks]
