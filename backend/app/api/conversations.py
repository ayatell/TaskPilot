
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Conversation, Message, User
from app.schemas import (
    ConversationCreate,
    ConversationUpdate,
    ConversationOut,
    MessageOut,
    MessageCreate,
)

router = APIRouter(
    prefix="/conversations",
    tags=["conversations"]
)


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(
    data: ConversationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = Conversation(
        user_id=user.id,
        title=data.title,
        theme=data.theme,
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return conversation


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    ).all()


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )

    if not conversation:
        raise HTTPException(404, "Conversation not found")

    return conversation


@router.get(
    "/{conversation_id}/messages",
    response_model=list[MessageOut]
)
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )

    if not conversation:
        raise HTTPException(404, "Conversation not found")

    return db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    ).all()


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: int,
    data: ConversationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )

    if not conversation:
        raise HTTPException(404, "Conversation not found")

    changes = data.model_dump(exclude_unset=True)

    for key, value in changes.items():
        if value is not None:
            setattr(conversation, key, value)

    db.commit()
    db.refresh(conversation)

    return conversation


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )

    if not conversation:
        raise HTTPException(404, "Conversation not found")

    db.delete(conversation)
    db.commit()

    return Response(status_code=204)


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
)
def create_message(
    conversation_id: int,
    data: MessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )

    if not conversation:
        raise HTTPException(404, "Conversation not found")

    message = Message(
        conversation_id=conversation.id,
        role=data.role,
        content=data.content,
        metadata_json=data.metadata_json,
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    return message
