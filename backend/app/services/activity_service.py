import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_log import ActivityLog


async def log_activity(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    event_type: str,
    task_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        project_id=project_id,
        actor_id=actor_id,
        event_type=event_type,
        task_id=task_id,
        event_metadata=metadata or {},
    )
    db.add(entry)
    await db.flush()
    return entry
