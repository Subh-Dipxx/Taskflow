import asyncio
import uuid
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(user_id, []).append(websocket)

    async def disconnect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id, [])
            if websocket in sockets:
                sockets.remove(websocket)
            if not sockets and user_id in self._connections:
                del self._connections[user_id]

    async def send_to_users(self, user_ids: set[uuid.UUID], message: dict[str, Any]) -> None:
        async with self._lock:
            targets: list[WebSocket] = []
            for uid in user_ids:
                targets.extend(self._connections.get(uid, []))
        dead: list[tuple[uuid.UUID, WebSocket]] = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                for uid, sockets in self._connections.items():
                    if ws in sockets:
                        dead.append((uid, ws))
                        break
        for uid, ws in dead:
            await self.disconnect(uid, ws)


manager = ConnectionManager()
