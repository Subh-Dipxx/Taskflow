import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.models.task import Task
from app.models.user import User
from app.services.activity_service import log_activity
from app.websocket.events import broadcast_activity, broadcast_to_project


async def create_comment(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    author: User,
    body: str,
) -> Comment:
    task_result = await db.execute(
        select(Task).where(Task.id == task_id, Task.project_id == project_id)
    )
    if task_result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Task not found")

    comment = Comment(task_id=task_id, author_id=author.id, body=body.strip())
    db.add(comment)
    await db.flush()
    activity = await log_activity(
        db,
        project_id=project_id,
        actor_id=author.id,
        event_type="comment.added",
        task_id=task_id,
        metadata={"comment_id": str(comment.id)},
    )
    await db.commit()
    await db.refresh(comment)
    await broadcast_to_project(
        db,
        project_id=project_id,
        event_type="comment.added",
        payload={
            "task_id": str(task_id),
            "comment": {
                "id": str(comment.id),
                "body": comment.body,
                "author_id": str(author.id),
                "author_name": author.name,
                "created_at": comment.created_at.isoformat(),
            },
        },
    )
    await broadcast_activity(
        db,
        project_id=project_id,
        activity={"id": str(activity.id), "event_type": activity.event_type, "task_id": str(task_id)},
    )
    return comment


async def list_comments(db: AsyncSession, *, task_id: uuid.UUID) -> list[tuple[Comment, User]]:
    result = await db.execute(
        select(Comment, User)
        .join(User, User.id == Comment.author_id)
        .where(Comment.task_id == task_id)
        .order_by(Comment.created_at.desc())
    )
    return list(result.all())
