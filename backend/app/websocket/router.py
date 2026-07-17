import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import decode_access_token
from app.database import async_session
from app.models.project_member import ProjectMember
from app.websocket.manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        user_id = decode_access_token(token)
    except ValueError:
        await websocket.close(code=4401)
        return

    await manager.connect(user_id, websocket)
    try:
        async with async_session() as db:
            result = await db.execute(
                select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
            )
            project_ids = [str(pid) for pid in result.scalars().all()]
        await websocket.send_json({"type": "connected", "project_ids": project_ids})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
