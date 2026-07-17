import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.activity_log import ActivityLog
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task import Task, TaskStatus
from app.models.user import User


async def get_project_activity(
    db: AsyncSession, *, project_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[tuple[ActivityLog, User]], int]:
    base = (
        select(ActivityLog, User)
        .join(User, User.id == ActivityLog.actor_id)
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.created_at.desc())
    )
    count = await db.execute(
        select(func.count()).select_from(
            select(ActivityLog).where(ActivityLog.project_id == project_id).subquery()
        )
    )
    total = count.scalar_one()
    result = await db.execute(base.offset((page - 1) * page_size).limit(page_size))
    return list(result.all()), total


async def get_dashboard(db: AsyncSession, *, user_id: uuid.UUID) -> dict:
    project_count_result = await db.execute(
        select(func.count()).select_from(ProjectMember).where(ProjectMember.user_id == user_id)
    )
    project_count = project_count_result.scalar_one()

    status_counts_result = await db.execute(
        select(Task.status, func.count())
        .join(ProjectMember, ProjectMember.project_id == Task.project_id)
        .where(Task.assignee_id == user_id, ProjectMember.user_id == user_id)
        .group_by(Task.status)
    )
    assigned_by_status = {s.value: 0 for s in TaskStatus}
    for status, count in status_counts_result.all():
        assigned_by_status[status.value] = count

    week_start = datetime.now(timezone.utc) - timedelta(days=7)
    completed_result = await db.execute(
        select(func.count())
        .select_from(Task)
        .join(ProjectMember, ProjectMember.project_id == Task.project_id)
        .where(
            Task.assignee_id == user_id,
            ProjectMember.user_id == user_id,
            Task.status == TaskStatus.DONE,
            Task.completed_at >= week_start,
        )
    )
    completed_this_week = completed_result.scalar_one()

    busiest_result = await db.execute(
        select(Project.id, Project.name, func.count(Task.id).label("open_count"))
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .outerjoin(Task, (Task.project_id == Project.id) & (Task.status != TaskStatus.DONE))
        .where(ProjectMember.user_id == user_id)
        .group_by(Project.id, Project.name)
        .order_by(func.count(Task.id).desc())
        .limit(1)
    )
    busiest_row = busiest_result.first()
    busiest_project = (
        {"id": str(busiest_row[0]), "name": busiest_row[1], "open_tasks": busiest_row[2]}
        if busiest_row
        else None
    )

    recent_result = await db.execute(
        select(ActivityLog, User, Project.name)
        .join(User, User.id == ActivityLog.actor_id)
        .join(ProjectMember, ProjectMember.project_id == ActivityLog.project_id)
        .join(Project, Project.id == ActivityLog.project_id)
        .where(ProjectMember.user_id == user_id, ActivityLog.actor_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(10)
    )
    recent_activity = [
        {
            "id": str(log.id),
            "project_id": str(log.project_id),
            "project_name": project_name,
            "actor_id": str(log.actor_id),
            "actor_name": user.name,
            "event_type": log.event_type,
            "task_id": str(log.task_id) if log.task_id else None,
            "event_metadata": log.event_metadata,
            "created_at": log.created_at.isoformat(),
        }
        for log, user, project_name in recent_result.all()
    ]

    return {
        "project_count": project_count,
        "assigned_by_status": assigned_by_status,
        "completed_this_week": completed_this_week,
        "busiest_project": busiest_project,
        "recent_activity": recent_activity,
    }
