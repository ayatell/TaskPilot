
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User, Task
from app.schemas import QuizOut, QuizQuestion, QuizRequest
from app.services import llm, rag


router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizOut)
def generate(
    data: QuizRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate the requested number of questions.
    if not 1 <= data.count <= 20:
        raise HTTPException(
            status_code=422,
            detail="The number of questions must be between 1 and 20.",
        )

    # Build the context from the user's own tasks or documents.
    if data.from_tasks:
        tasks = db.scalars(
            select(Task)
            .where(
                Task.user_id == user.id,
                Task.status != "done",
            )
            .order_by(Task.due_date)
            .limit(20)
        ).all()

        context = "\n".join(
            f"- {task.title} "
            f"({task.subject or 'general'}) "
            f"{task.description or ''}"
            for task in tasks
        )

        if not context:
            raise HTTPException(
                status_code=422,
                detail="Add tasks to your to-do list first.",
            )

    else:
        context = rag.sample(
            db,
            user.id,
            data.document_ids,
        )

        if not context:
            raise HTTPException(
                status_code=422,
                detail="Upload a document first.",
            )

    # Generate the quiz using the LLM.
    try:
        raw = llm.ask_quiz(
            context,
            user.lang or "fr",
            data.count,
        )

    except llm.LLMUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail=f"The assistant is temporarily unavailable: {exc}",
        ) from exc

    # Validate the LLM response.
    if not isinstance(raw, dict):
        raise HTTPException(
            status_code=502,
            detail="The assistant returned an invalid response.",
        )

    raw_questions = raw.get("questions")

    if not isinstance(raw_questions, list):
        raise HTTPException(
            status_code=502,
            detail="The assistant did not return a valid question list.",
        )

    questions = []

    for question in raw_questions:
        try:
            validated_question = QuizQuestion.model_validate(question)
            questions.append(validated_question)

        except ValidationError:
            # Ignore malformed questions.
            continue

    # Ensure that enough valid questions were generated.
    if len(questions) < data.count:
        raise HTTPException(
            status_code=502,
            detail=(
                f"The assistant generated only {len(questions)} "
                f"valid questions out of {data.count}. "
                "Please try again."
            ),
        )

    # Return exactly the requested number of questions.
    questions = questions[:data.count]

    title = str(raw.get("title") or "Quiz").strip()[:200]

    return QuizOut(
        title=title or "Quiz",
        questions=questions,
    )
