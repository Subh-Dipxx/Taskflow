import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project_member import ProjectMember
from app.models.task import Task
from app.schemas.task import TaskResponse
from app.websocket.manager import manager


async def get_project_member_ids(db: AsyncSession, project_id: uuid.UUID) -> set[uuid.UUID]:
    result = await db.execute(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)
    )
    return set(result.scalars().all())


def _task_payload(task: Task) -> dict[str, Any]:
    data = TaskResponse.model_validate(task).model_dump(mode="json")
    if task.assignee:
        data["assignee"] = {"id": str(task.assignee.id), "name": task.assignee.name, "email": task.assignee.email}
    return data


async def broadcast_to_project(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    member_ids = await get_project_member_ids(db, project_id)
    await manager.send_to_users(member_ids, {"type": event_type, "project_id": str(project_id), **payload})


async def broadcast_task_event(
    db: AsyncSession,
    event_type: str,
    *,
    project_id: uuid.UUID,
    task: Task,
) -> None:
    await broadcast_to_project(
        db,
        project_id=project_id,
        event_type=event_type,
        payload={"task": _task_payload(task)},
    )


async def broadcast_member_event(
    db: AsyncSession,
    event_type: str,
    *,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    extra: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {"user_id": str(user_id)}
    if extra:
        payload.update(extra)
    await broadcast_to_project(db, project_id=project_id, event_type=event_type, payload=payload)


async def broadcast_activity(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    activity: dict[str, Any],
) -> None:
    await broadcast_to_project(
        db,
        project_id=project_id,
        event_type="activity.new",
        payload={"activity": activity},
    )
