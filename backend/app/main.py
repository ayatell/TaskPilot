from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (registers tables)
from app.api import auth, chat, dashboard, documents, planning, tasks, library, quiz
from app.core.config import settings
from app.db.session import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="TaskPilot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(planning.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(library.router)
app.include_router(quiz.router)



@app.get("/health")
def health():
    return {"status": "ok"}