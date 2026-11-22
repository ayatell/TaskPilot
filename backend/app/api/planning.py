from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Task, User
from app.schemas import PlanOut, PlanRequest
from app.services import bandit, planner

router = APIRouter(prefix="/planning", tags=["planning"])


@router.post("/generate", response_model=PlanOut)
def generate(data: PlanRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tasks = db.scalars(select(Task).where(Task.user_id == user.id, Task.status != "done")).all()

    arm_by_subject: dict[str, int] = {}      # one arm per subject
    plan_tasks = []
    for t in tasks:
        subject = t.subject or ""
        if subject not in arm_by_subject:
            arm_by_subject[subject] = bandit.choose_arm(db, user.id, subject)
        arm = arm_by_subject[subject]
        t.bandit_arm = arm                   # remembered for the feedback step
        minutes = max(1, round(t.estimated_minutes * bandit.ARMS[arm]))
        plan_tasks.append(planner.PlanTask(t.id, t.title, t.due_date, t.priority, minutes))
    db.commit()

    result = planner.generate_plan(plan_tasks, data.availability)
    return {
        "blocks": [asdict(b) for b in result.blocks],
        "unscheduled": result.unscheduled,
        "warnings": result.warnings,
    }