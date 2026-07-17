import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    actor_id: uuid.UUID
    actor_name: str
    event_type: str
    task_id: uuid.UUID | None
    event_metadata: dict
    created_at: datetime


class ActivityListResponse(BaseModel):
    items: list[ActivityResponse]
    total: int
    page: int
    page_size: int


class DashboardResponse(BaseModel):
    project_count: int
    assigned_by_status: dict[str, int]
    completed_this_week: int
    busiest_project: dict | None
    recent_activity: list[ActivityResponse]
