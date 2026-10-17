from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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