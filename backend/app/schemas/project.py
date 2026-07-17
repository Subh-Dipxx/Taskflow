import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.project_member import ProjectRole


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_by: uuid.UUID
    created_at: datetime
    role: ProjectRole | None = None

    model_config = {"from_attributes": True}
