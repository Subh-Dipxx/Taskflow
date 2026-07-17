import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.project_access import EffectiveRole, ProjectAccessResult, require_project_access
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentResponse
from app.services import comment_service

router = APIRouter(tags=["comments"])


@router.post("/projects/{project_id}/tasks/{task_id}/comments", response_model=CommentResponse)
async def create_comment(
    task_id: uuid.UUID,
    body: CommentCreate,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = await comment_service.create_comment(
        db,
        project_id=access.project.id,
        task_id=task_id,
        author=current_user,
        body=body.body,
    )
    return CommentResponse(
        id=comment.id,
        task_id=comment.task_id,
        author_id=comment.author_id,
        author_name=current_user.name,
        body=comment.body,
        created_at=comment.created_at,
    )


@router.get("/projects/{project_id}/tasks/{task_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    task_id: uuid.UUID,
    access: ProjectAccessResult = Depends(require_project_access(EffectiveRole.MEMBER)),
    db: AsyncSession = Depends(get_db),
):
    rows = await comment_service.list_comments(db, task_id=task_id)
    return [
        CommentResponse(
            id=c.id,
            task_id=c.task_id,
            author_id=c.author_id,
            author_name=u.name,
            body=c.body,
            created_at=c.created_at,
        )
        for c, u in rows
    ]
