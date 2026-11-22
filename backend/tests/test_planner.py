from datetime import date

from app.services.planner import PlanTask, generate_plan

D1, D2, D3 = date(2026, 11, 16), date(2026, 11, 17), date(2026, 11, 18)


def test_nothing_after_deadline():
    tasks = [PlanTask(1, "Exam", D2, 3, 240)]
    res = generate_plan(tasks, {D1: 120, D2: 120, D3: 120})
    assert all(b.day <= D2 for b in res.blocks)
    assert res.unscheduled == []


def test_no_day_exceeds_availability():
    tasks = [PlanTask(1, "A", D3, 2, 200), PlanTask(2, "B", D3, 1, 200)]
    avail = {D1: 120, D2: 120, D3: 120}
    res = generate_plan(tasks, avail)
    for day, cap in avail.items():
        assert sum(b.minutes for b in res.blocks if b.day == day) <= cap


def test_impossible_goes_to_unscheduled():
    tasks = [PlanTask(1, "Huge", D1, 3, 600)]
    res = generate_plan(tasks, {D1: 60, D2: 60})
    assert res.unscheduled == [1]
    assert res.warnings


def test_earliest_deadline_first():
    tasks = [PlanTask(1, "Late", D3, 3, 60), PlanTask(2, "Soon", D1, 1, 60)]
    res = generate_plan(tasks, {D1: 60, D2: 60, D3: 60})
    assert res.blocks[0].task_id == 2