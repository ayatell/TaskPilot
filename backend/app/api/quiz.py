from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas import QuizOut, QuizQuestion, QuizRequest
from app.services import llm, rag

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizOut)
def generate(data: QuizRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    context = rag.sample(db, user.id, data.document_ids)     # only this user's chunks
    if not context:
        raise HTTPException(422, "Upload a document first")

    try:
        raw = llm.ask_quiz(context, user.lang or "fr", data.count)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, f"The assistant is temporarily unavailable: {e}")

    questions = []
    for q in raw.get("questions", []) if isinstance(raw, dict) else []:
        try:
            questions.append(QuizQuestion.model_validate(q))
        except ValidationError:
            continue                                         # drop malformed questions
    if not questions:
        raise HTTPException(502, "The assistant returned an invalid quiz. Please try again.")

    title = str(raw.get("title") or "Quiz")[:200]
    return QuizOut(title=title, questions=questions)