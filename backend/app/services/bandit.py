import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BanditArm

ARMS = [0.8, 1.0, 1.25, 1.5, 2.0]   # duration multipliers
DEFAULT_ARM = 1                      # index of 1.0
EPSILON = 0.1                        # exploration probability


def choose_arm(db: Session, user_id: int, subject: str) -> int:
    if random.random() < EPSILON:
        return random.randrange(len(ARMS))
    rows = db.scalars(
        select(BanditArm).where(
            BanditArm.user_id == user_id, BanditArm.subject == subject, BanditArm.pulls > 0
        )
    ).all()
    if not rows:
        return DEFAULT_ARM
    return max(rows, key=lambda r: r.mean_reward).arm


def reward(arm: int, estimated: int, actual: int) -> float:
    # best when the multiplier matches the real ratio actual/estimated
    return -abs(ARMS[arm] - actual / estimated)


def update(db: Session, user_id: int, subject: str, arm: int, r: float) -> None:
    row = db.scalar(
        select(BanditArm).where(
            BanditArm.user_id == user_id, BanditArm.subject == subject, BanditArm.arm == arm
        )
    )
    if row is None:
        row = BanditArm(user_id=user_id, subject=subject, arm=arm, pulls=0, mean_reward=0.0)
        db.add(row)
    row.pulls += 1
    row.mean_reward += (r - row.mean_reward) / row.pulls