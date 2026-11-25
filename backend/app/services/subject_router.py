
import re

from app.services import llm


def _mentions(message: str, subjects) -> list[str]:
    low = message.casefold()

    return [
        subject
        for subject in subjects
        if re.search(
            rf"(?<!\w){re.escape(subject.casefold())}(?!\w)",
            low,
        )
    ]


def _mentioned(message: str, subjects) -> str | None:
    hits = _mentions(message, subjects)
    return hits[0] if len(hits) == 1 else None


def resolve_subject(message, history, overview, previous):
    if not overview:
        return None

    if len(overview) == 1:
        return next(iter(overview))

    hit = _mentioned(message, overview)

    if hit:
        return hit

    try:
        return llm.pick_subject(
            history,
            overview,
            previous,
        )
    except llm.LLMUnavailable:
        return previous


def resolve_summary_subject(message, history, overview):
    """
    Identify exactly one subject for summary generation.
    Never fall back to an unrelated subject.
    """

    if not overview:
        return None

    hits = _mentions(message, overview)

    if len(hits) == 1:
        return hits[0]

    if len(hits) > 1:
        return llm.AMBIGUOUS

    subject = llm.pick_subject(
        history,
        overview,
        previous=None,
    )

    if subject in overview:
        return subject

    return llm.AMBIGUOUS
