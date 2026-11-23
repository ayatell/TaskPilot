from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas import SummaryOut, SummaryRequest
from app.services import llm, rag

router = APIRouter(prefix="/summaries", tags=["summaries"])


@router.post("/generate", response_model=SummaryOut)
def generate(data: SummaryRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    context = rag.sample(db, user.id, data.document_ids)
    if not context:
        raise HTTPException(422, "Upload a document first")
    try:
        text = llm.ask_summary(context, user.lang or "fr")
    except llm.LLMUnavailable as e:
        raise HTTPException(503, f"The assistant is temporarily unavailable: {e}")
    title = text.split("\n", 1)[0].lstrip("# ").strip()[:200] or "Summary"
    return SummaryOut(title=title, content=text)