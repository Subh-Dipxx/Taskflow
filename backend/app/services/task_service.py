import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.project_access import EffectiveRole
from app.models.project_member import ProjectMember
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User
from app.services.activity_service import log_activity
from app.websocket.events import broadcast_activity, broadcast_task_event


async def _assert_is_member(db: AsyncSession, *, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Assignee must be a current member of this project",
        )


async def _load_task(db: AsyncSession, task_id: uuid.UUID, project_id: uuid.UUID) -> Task:
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.id == task_id, Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


async def create_task(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    created_by: User,
    title: str,
    description: str | None,
    status: TaskStatus,
    priority: TaskPriority,
    due_date: date | None,
    assignee_id: uuid.UUID | None,
) -> Task:
    if not title.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title cannot be empty")
    if due_date is not None and due_date < date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Due date cannot be in the past")
    if assignee_id is not None:
        await _assert_is_member(db, project_id=project_id, user_id=assignee_id)

    completed_at = datetime.now(timezone.utc) if status == TaskStatus.DONE else None
    task = Task(
        project_id=project_id,
        title=title.strip(),
        description=description,
        status=status,
        priority=priority,
        due_date=due_date,
        assignee_id=assignee_id,
        created_by=created_by.id,
        completed_at=completed_at,
    )
    db.add(task)
    await db.flush()
    activity = await log_activity(
        db, project_id=project_id, actor_id=created_by.id, event_type="task.created", task_id=task.id
    )
    await db.commit()
    task = await _load_task(db, task.id, project_id)
    await broadcast_task_event(db, "task.created", project_id=project_id, task=task)
    await broadcast_activity(
        db,
        project_id=project_id,
        activity={"id": str(activity.id), "event_type": activity.event_type, "task_id": str(task.id)},
    )
    return task


async def list_tasks(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    page: int,
    page_size: int,
    status_filter: TaskStatus | None,
    assignee_id: uuid.UUID | None,
    priority: TaskPriority | None,
    search: str | None,
    sort_by: str,
    sort_dir: str,
) -> tuple[list[Task], int]:
    query = select(Task).options(selectinload(Task.assignee)).where(Task.project_id == project_id)

    if status_filter:
        query = query.where(Task.status == status_filter)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    if priority:
        query = query.where(Task.priority == priority)
    if search:
        query = query.where(Task.title.ilike(f"%{search}%"))

    priority_order = {"high": 1, "medium": 2, "low": 3}
    sort_column = {
        "priority": Task.priority,
        "due_date": Task.due_date,
        "created_at": Task.created_at,
    }.get(sort_by, Task.created_at)

    if sort_by == "priority":
        query = query.order_by(
            sort_column.asc() if sort_dir == "asc" else sort_column.desc(),
            Task.created_at.desc(),
        )
    else:
        nulls_last = sort_column.is_(None) if sort_dir == "asc" else sort_column.isnot(None)
        query = query.order_by(nulls_last, sort_column.asc() if sort_dir == "asc" else sort_column.desc())

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def update_task(
    db: AsyncSession,
    *,
    task: Task,
    project_id: uuid.UUID,
    actor: User,
    actor_effective_role: EffectiveRole,
    title: str | None = None,
    description: str | None = None,
    new_status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    due_date: date | None = None,
    new_assignee_id: uuid.UUID | None | object = ...,
) -> Task:
    old_status = task.status
    old_assignee = task.assignee_id

    if new_status == TaskStatus.DONE and task.status != TaskStatus.DONE:
        is_owner = actor_effective_role == EffectiveRole.OWNER
        is_assignee = task.assignee_id == actor.id
        if not (is_owner or is_assignee):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Only the assignee or the project owner can mark this task Done",
            )

    if title is not None:
        if not title.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title cannot be empty")
        task.title = title.strip()
    if description is not None:
        task.description = description
    if priority is not None:
        task.priority = priority
    if due_date is not None and due_date < date.today() and task.due_date != due_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Due date cannot be in the past")

    if new_assignee_id is not ...:
        if new_assignee_id is not None:
            await _assert_is_member(db, project_id=project_id, user_id=new_assignee_id)
        task.assignee_id = new_assignee_id

    if new_status is not None:
        entering_done = new_status == TaskStatus.DONE and task.status != TaskStatus.DONE
        leaving_done = new_status != TaskStatus.DONE and task.status == TaskStatus.DONE
        task.status = new_status
        if entering_done:
            task.completed_at = datetime.now(timezone.utc)
        elif leaving_done:
            task.completed_at = None

    task.updated_at = datetime.now(timezone.utc)
    await db.flush()

    if new_status is not None and new_status != old_status:
        event_type = "task.moved"
    elif new_assignee_id is not ... and new_assignee_id != old_assignee:
        event_type = "task.assigned"
    else:
        event_type = "task.updated"

    activity = await log_activity(
        db, project_id=project_id, actor_id=actor.id, event_type=event_type, task_id=task.id
    )
    await db.commit()
    task = await _load_task(db, task.id, project_id)
    await broadcast_task_event(db, event_type, project_id=project_id, task=task)
    await broadcast_activity(
        db,
        project_id=project_id,
        activity={"id": str(activity.id), "event_type": activity.event_type, "task_id": str(task.id)},
    )
    return task


async def delete_task(
    db: AsyncSession, *, task: Task, project_id: uuid.UUID, actor_id: uuid.UUID
) -> None:
    from app.websocket.events import broadcast_to_project

    task_id = task.id
    await db.delete(task)
    activity = await log_activity(
        db, project_id=project_id, actor_id=actor_id, event_type="task.deleted", task_id=task_id
    )
    await db.commit()
    await broadcast_to_project(
        db,
        project_id=project_id,
        event_type="task.deleted",
        payload={"task_id": str(task_id)},
    )


async def get_assigned_tasks(db: AsyncSession, *, user_id: uuid.UUID) -> list[Task]:
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.project))
        .join(ProjectMember, ProjectMember.project_id == Task.project_id)
        .where(Task.assignee_id == user_id, ProjectMember.user_id == user_id)
        .order_by(Task.updated_at.desc())
    )
    return list(result.scalars().all())
