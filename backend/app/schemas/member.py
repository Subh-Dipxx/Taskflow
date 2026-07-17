import re
import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.project_member import ProjectRole

EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class InviteMemberRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_PATTERN.match(v):
            raise ValueError("Invalid email format")
        return v


class MemberResponse(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    role: ProjectRole
    joined_at: datetime


class ChangeRoleRequest(BaseModel):
    role: ProjectRole

