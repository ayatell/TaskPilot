from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Conversation, Message, User, Task
from app.schemas import ChatRequest, ChatResponse, ProposedAction
from app.services import llm, skills, rag


router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(data: ChatRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if data.conversation_id:
        conv = db.scalar(
            select(Conversation).where(
                Conversation.id == data.conversation_id, Conversation.user_id == user.id
            )
        )
        if not conv:
            raise HTTPException(404, "Conversation not found")
    else:
        conv = Conversation(user_id=user.id, title=data.message[:60])
        db.add(conv)
        db.flush()   # get conv.id

    # save the user message BEFORE calling the LLM, so it survives an outage
    db.add(Message(conversation_id=conv.id, role="user", content=data.message))
    db.commit()

    rows = db.scalars(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.id.desc()).limit(12)
    ).all()
    history = [{"role": m.role, "content": m.content} for m in reversed(rows)]

    open_tasks = db.scalars(
        select(Task)
        .where(Task.user_id == user.id, Task.status != "done")
        .order_by(Task.due_date)
        .limit(30)
    ).all()
    tasks_ctx = "\n".join(
        f"- #{t.id} {t.title} | due {t.due_date or 'none'} | priority {t.priority} | {t.estimated_minutes} min"
        for t in open_tasks
    )

    if data.broad:
        context = rag.sample(db, user.id, data.document_ids)
    else:
        context = rag.retrieve(db, user.id, data.message, document_ids=data.document_ids)

    try:
        result = llm.ask_llm(history, user.lang or "fr", context=context, tasks=tasks_ctx)
    except llm.LLMUnavailable as e:
        raise HTTPException(503, f"The assistant is temporarily unavailable: {e}")

    actions, ranking = [], None
    for raw in result["actions"]:
        if isinstance(raw, dict) and raw.get("type") == "prioritize":
            ranking = skills.prioritize(open_tasks)      # computed by code, not by the LLM
            continue
        try:
            actions.append(ProposedAction.model_validate(raw))
        except ValidationError:
            continue
    actions = actions[:12]

    db.add(Message(conversation_id=conv.id, role="assistant", content=result["reply"]))
    db.commit()
    return ChatResponse(conversation_id=conv.id, reply=result["reply"], actions=actions, ranking=ranking)
    