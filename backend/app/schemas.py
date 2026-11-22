from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt limit is 72 bytes
    lang: Literal["fr", "en"] = "fr"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    lang: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    subject: str | None = Field(default=None, max_length=100)
    priority: int = Field(default=2, ge=1, le=3)
    due_date: date | None = None
    estimated_minutes: int = Field(default=60, ge=5, le=1440)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    subject: str | None = Field(default=None, max_length=100)
    priority: int | None = Field(default=None, ge=1, le=3)
    status: Literal["todo", "doing", "done"] | None = None
    due_date: date | None = None
    estimated_minutes: int | None = Field(default=None, ge=5, le=1440)
    actual_minutes: int | None = Field(default=None, ge=1, le=1440)


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str | None
    subject: str | None
    priority: int
    status: str
    due_date: date | None
    estimated_minutes: int
    actual_minutes: int | None


class ProgressOut(BaseModel):
    done: int
    total: int


class DashboardOut(BaseModel):
    today: list[TaskOut]
    upcoming: list[TaskOut]
    overdue: list[TaskOut]
    progress: ProgressOut


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None
    document_ids: list[int] | None = Field(default=None, max_length=50)
    broad: bool = False        # True = spread excerpts across documents (summaries)


class ProposedAction(BaseModel):
    type: Literal["create_task"]
    task: TaskCreate


class RankedTask(BaseModel):
    task_id: int
    title: str
    due_date: date | None
    priority: int
    score: int
    quadrant: Literal["do_now", "schedule", "quick", "later"]
    reason: Literal["overdue", "due_today", "due_soon", "due_this_week", "later", "no_deadline"]


class ChatResponse(BaseModel):
    conversation_id: int
    reply: str
    actions: list[ProposedAction]
    ranking: list[RankedTask] | None = None


class TaskBulkCreate(BaseModel):
    tasks: list[TaskCreate] = Field(min_length=1, max_length=20)


class PlanRequest(BaseModel):
    # {"2026-11-16": 120, ...} = available minutes per day
    availability: dict[date, Annotated[int, Field(ge=0, le=1440)]] = Field(min_length=1, max_length=31)


class BlockOut(BaseModel):
    task_id: int
    title: str
    day: date
    minutes: int


class PlanOut(BaseModel):
    blocks: list[BlockOut]
    unscheduled: list[int]
    warnings: list[str]

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    created_at: datetime

class SavedItemCreate(BaseModel):
    kind: Literal["quiz", "summary"]
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)


class SavedItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    title: str
    content: str
    created_at: datetime

class QuizRequest(BaseModel):
    document_ids: list[int] | None = Field(default=None, max_length=50)
    count: int = Field(default=5, ge=3, le=10)

class QuizQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=6)
    answer: int = Field(ge=0)
    explanation: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def answer_in_range(self):
        if self.answer >= len(self.options):
            raise ValueError("answer index out of range")
        return self


class QuizOut(BaseModel):
    title: str
    questions: list[QuizQuestion]