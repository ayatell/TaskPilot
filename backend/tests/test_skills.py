from datetime import date
from types import SimpleNamespace

from app.services.skills import prioritize

TODAY = date(2026, 11, 20)


def T(id, due, prio):
    return SimpleNamespace(id=id, title=f"t{id}", due_date=due, priority=prio)


def test_overdue_comes_first():
    tasks = [T(1, date(2026, 12, 30), 3), T(2, date(2026, 11, 18), 1)]
    assert prioritize(tasks, TODAY)[0]["task_id"] == 2


def test_quadrants():
    r = {x["task_id"]: x for x in prioritize([T(1, date(2026, 11, 21), 3), T(2, None, 3)], TODAY)}
    assert r[1]["quadrant"] == "do_now"
    assert r[2]["quadrant"] == "schedule"


def test_no_deadline_does_not_crash():
    assert prioritize([T(1, None, 1)], TODAY)[0]["reason"] == "no_deadline"