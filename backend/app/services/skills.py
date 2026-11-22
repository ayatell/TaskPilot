from datetime import date

URGENT_DAYS = 2


def _urgency(days: int | None) -> tuple[int, str]:
    if days is None:
        return 1, "no_deadline"
    if days < 0:
        return 10, "overdue"
    if days == 0:
        return 9, "due_today"
    if days <= URGENT_DAYS:
        return 7, "due_soon"
    if days <= 7:
        return 5, "due_this_week"
    return 2, "later"


def prioritize(tasks, today: date | None = None) -> list[dict]:
    """Eisenhower matrix + score. Pure logic, no DB access."""
    today = today or date.today()
    ranked = []
    for t in tasks:
        days = None if t.due_date is None else (t.due_date - today).days
        urgency, reason = _urgency(days)
        urgent = days is not None and days <= URGENT_DAYS
        important = t.priority >= 2
        if urgent and important:
            quadrant = "do_now"
        elif important:
            quadrant = "schedule"
        elif urgent:
            quadrant = "quick"
        else:
            quadrant = "later"
        ranked.append({
            "task_id": t.id,
            "title": t.title,
            "due_date": t.due_date,
            "priority": t.priority,
            "score": urgency * 2 + t.priority * 3,
            "quadrant": quadrant,
            "reason": reason,
        })
    ranked.sort(key=lambda r: (-r["score"], r["due_date"] or date.max))
    return ranked