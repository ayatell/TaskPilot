from dataclasses import dataclass
from datetime import date

MIN_SLOT = 30  # don't create blocks shorter than this, unless they finish the task


@dataclass
class PlanTask:
    id: int
    title: str
    due_date: date | None
    priority: int
    minutes: int


@dataclass
class Block:
    task_id: int
    title: str
    day: date
    minutes: int


@dataclass
class PlanResult:
    blocks: list[Block]
    unscheduled: list[int]
    warnings: list[str]


def generate_plan(tasks: list[PlanTask], availability: dict[date, int]) -> PlanResult:
    remaining = dict(availability)          # copy: minutes still free per day
    days = sorted(remaining)
    blocks: list[Block] = []
    unscheduled: list[int] = []
    warnings: list[str] = []

    # earliest deadline first, then highest priority; no deadline goes last
    ordered = sorted(tasks, key=lambda t: (t.due_date or date.max, -t.priority))

    for task in ordered:
        left = task.minutes
        for day in days:
            if left <= 0:
                break
            if task.due_date and day > task.due_date:
                break                        # days are sorted, so all later days are too late
            free = remaining[day]
            if free <= 0:
                continue
            chunk = min(free, left)
            if chunk < MIN_SLOT and chunk < left:
                continue                     # too small and doesn't finish the task
            blocks.append(Block(task.id, task.title, day, chunk))
            remaining[day] -= chunk
            left -= chunk

        if left > 0:
            unscheduled.append(task.id)
            warnings.append(
                f"'{task.title}': {task.minutes - left}/{task.minutes} min scheduled before the deadline"
            )

    return PlanResult(blocks, unscheduled, warnings)