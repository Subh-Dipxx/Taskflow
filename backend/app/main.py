from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import activity, auth, comments, members, projects, tasks
from app.websocket.router import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="TaskFlow API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(members.router)
app.include_router(tasks.router)
app.include_router(comments.router)
app.include_router(activity.router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
