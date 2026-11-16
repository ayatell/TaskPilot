from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Task, User
from app.schemas import DashboardOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tasks = db.scalars(
        select(Task).where(Task.user_id == user.id).order_by(Task.due_date, Task.id)
    ).all()
    today = date.today()
    week = today + timedelta(days=7)
    open_tasks = [t for t in tasks if t.status != "done"]
    return {
        "today": [t for t in open_tasks if t.due_date == today],
        "upcoming": [t for t in open_tasks if t.due_date and today < t.due_date <= week],
        "overdue": [t for t in open_tasks if t.due_date and t.due_date < today],
        "progress": {"done": sum(t.status == "done" for t in tasks), "total": len(tasks)},
    }
