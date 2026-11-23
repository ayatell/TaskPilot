
from datetime import datetime, timezone

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
def chat(
    data: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Send a message to the assistant.

    - Reuses the supplied conversation when conversation_id exists.
    - Creates a conversation only when conversation_id is None.
    - Includes previous messages in the LLM context.
    - Saves user and assistant messages together after successful generation.
    - Stores proposed actions and task rankings in message metadata.
    """

    try:
        # -------------------------------------------------
        # 1. Retrieve or create the conversation
        # -------------------------------------------------

        if data.conversation_id is not None:
            conv = db.scalar(
                select(Conversation).where(
                    Conversation.id == data.conversation_id,
                    Conversation.user_id == user.id,
                )
            )

            if conv is None:
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found",
                )

        else:
            title = data.message.strip()[:60] or "New conversation"

            conv = Conversation(
                user_id=user.id,
                title=title,
                theme="default",
            )

            db.add(conv)
            db.flush()

        # -------------------------------------------------
        # 2. Update the conversation activity
        # -------------------------------------------------

        now = datetime.now(timezone.utc)
        conv.updated_at = now

        # If the conversation was created separately by
        # Workspace, replace its default title with the
        # first actual user message.
        if (
            conv.title.strip().lower() == "new conversation"
            and data.message.strip()
        ):
            conv.title = data.message.strip()[:60]

        # -------------------------------------------------
        # 3. Retrieve previous conversation messages
        # -------------------------------------------------

        previous_messages = db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.id.desc())
            .limit(11)
        ).all()

        history = [
            {
                "role": message.role,
                "content": message.content,
            }
            for message in reversed(previous_messages)
        ]

        # Include the current user message in the LLM context.
        history.append(
            {
                "role": "user",
                "content": data.message,
            }
        )

        # -------------------------------------------------
        # 4. Retrieve unfinished tasks
        # -------------------------------------------------

        open_tasks = db.scalars(
            select(Task)
            .where(
                Task.user_id == user.id,
                Task.status != "done",
            )
            .order_by(Task.due_date.asc().nulls_last())
            .limit(30)
        ).all()

        tasks_ctx = "\n".join(
            (
                f"- #{task.id} {task.title} | "
                f"due {task.due_date or 'none'} | "
                f"priority {task.priority} | "
                f"{task.estimated_minutes} min"
            )
            for task in open_tasks
        )

        # -------------------------------------------------
        # 5. Retrieve document context (RAG)
        # -------------------------------------------------

        if data.broad:
            context = rag.sample(
                db,
                user.id,
                data.document_ids,
            )
        else:
            context = rag.retrieve(
                db,
                user.id,
                data.message,
                document_ids=data.document_ids,
            )

        # -------------------------------------------------
        # 6. Generate assistant response
        # -------------------------------------------------

        result = llm.ask_llm(
            history,
            user.lang or "fr",
            context=context,
            tasks=tasks_ctx,
        )

        if not isinstance(result, dict):
            raise HTTPException(
                status_code=502,
                detail="The assistant returned an invalid response.",
            )

        reply = result.get("reply")

        if not isinstance(reply, str) or not reply.strip():
            raise HTTPException(
                status_code=502,
                detail="The assistant returned an empty response.",
            )

        # -------------------------------------------------
        # 7. Validate proposed actions and ranking
        # -------------------------------------------------

        actions = []
        ranking = None

        raw_actions = result.get("actions", [])

        if isinstance(raw_actions, list):
            for raw_action in raw_actions:
                if (
                    isinstance(raw_action, dict)
                    and raw_action.get("type") == "prioritize"
                ):
                    ranking = skills.prioritize(open_tasks)
                    continue

                try:
                    validated_action = ProposedAction.model_validate(
                        raw_action
                    )
                    actions.append(validated_action)

                except ValidationError:
                    # Ignore malformed actions without
                    # discarding the assistant's response.
                    continue

        actions = actions[:12]

        # -------------------------------------------------
        # 8. Create the user message
        # -------------------------------------------------

        user_message = Message(
            conversation_id=conv.id,
            role="user",
            content=data.message,
        )

        db.add(user_message)

        # -------------------------------------------------
        # 9. Create the assistant message
        # -------------------------------------------------

        metadata = {
            "actions": [
                action.model_dump(mode="json")
                for action in actions
            ],
            "ranking": (
                [
                    item.model_dump(mode="json")
                    for item in ranking
                ]
                if ranking is not None
                else None
            ),
        }

        assistant_message = Message(
            conversation_id=conv.id,
            role="assistant",
            content=reply,
            metadata_json=metadata,
        )

        db.add(assistant_message)

        conv.updated_at = datetime.now(timezone.utc)

        # -------------------------------------------------
        # 10. Save both messages together
        # -------------------------------------------------

        db.commit()

        return ChatResponse(
            conversation_id=conv.id,
            reply=reply,
            actions=actions,
            ranking=ranking,
        )

    except llm.LLMUnavailable as exc:
        # Do not leave an orphan user message in the database.
        db.rollback()

        raise HTTPException(
            status_code=503,
            detail=f"The assistant is temporarily unavailable: {exc}",
        ) from exc

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise
