from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Task, User
from app.schemas import TaskCreate, TaskOut, TaskUpdate, TaskBulkCreate
from app.services import bandit

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _own(db: Session, user: User, task_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.get("", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(select(Task).where(Task.user_id == user.id).order_by(Task.due_date, Task.id)).all()


@router.post("", response_model=TaskOut, status_code=201)
def create_task(data: TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = Task(**data.model_dump(), user_id=user.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.post("/bulk", response_model=list[TaskOut], status_code=201)
def create_tasks_bulk(data: TaskBulkCreate, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    created = [Task(**t.model_dump(), user_id=user.id) for t in data.tasks]
    db.add_all(created)
    db.commit()
    for t in created:
        db.refresh(t)
    return created

@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _own(db, user, task_id)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    task = _own(db, user, task_id)
    was_done = task.status == "done"
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    if (not was_done and task.status == "done" and task.actual_minutes
            and task.bandit_arm is not None):
        r = bandit.reward(task.bandit_arm, task.estimated_minutes, task.actual_minutes)
        bandit.update(db, user.id, task.subject or "", task.bandit_arm, r)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(_own(db, user, task_id))
    db.commit()
    return Response(status_code=204)