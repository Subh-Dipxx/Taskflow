"""Seed database with test users and sample project."""

import asyncio
import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database import async_session
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User


async def seed() -> None:
    async with async_session() as db:
        existing = await db.execute(select(User).where(User.email == "alice@taskflow.test"))
        if existing.scalar_one_or_none():
            print("Seed data already exists, skipping.")
            return

        alice = User(
            id=uuid.uuid4(),
            name="Alice Owner",
            email="alice@taskflow.test",
            password_hash=hash_password("Alice123"),
        )
        bob = User(
            id=uuid.uuid4(),
            name="Bob Member",
            email="bob@taskflow.test",
            password_hash=hash_password("Bob12345"),
        )
        db.add_all([alice, bob])
        await db.flush()

        project = Project(
            id=uuid.uuid4(),
            name="TaskFlow Demo Project",
            description="Shared project for testing collaboration and real-time updates.",
            created_by=alice.id,
        )
        db.add(project)
        await db.flush()

        db.add_all(
            [
                ProjectMember(project_id=project.id, user_id=alice.id, role=ProjectRole.OWNER),
                ProjectMember(project_id=project.id, user_id=bob.id, role=ProjectRole.MEMBER),
            ]
        )

        tasks = [
            Task(
                project_id=project.id,
                title="Set up project board",
                description="Create columns and initial tasks.",
                status=TaskStatus.DONE,
                priority=TaskPriority.HIGH,
                assignee_id=alice.id,
                created_by=alice.id,
                completed_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
            ),
            Task(
                project_id=project.id,
                title="Implement real-time updates",
                description="WebSocket events for board changes.",
                status=TaskStatus.IN_PROGRESS,
                priority=TaskPriority.HIGH,
                assignee_id=bob.id,
                created_by=alice.id,
            ),
            Task(
                project_id=project.id,
                title="Write README",
                description="Document setup and architecture decisions.",
                status=TaskStatus.TODO,
                priority=TaskPriority.MEDIUM,
                assignee_id=None,
                created_by=bob.id,
            ),
        ]
        db.add_all(tasks)
        await db.commit()
        print("Seed complete.")
        print("  Alice: alice@taskflow.test / Alice123")
        print("  Bob:   bob@taskflow.test / Bob12345")


if __name__ == "__main__":
    asyncio.run(seed())
