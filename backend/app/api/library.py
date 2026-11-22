from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import SavedItem, User
from app.schemas import SavedItemCreate, SavedItemOut

router = APIRouter(prefix="/library", tags=["library"])


@router.get("", response_model=list[SavedItemOut])
def list_items(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(
        select(SavedItem).where(SavedItem.user_id == user.id).order_by(SavedItem.id.desc())
    ).all()


@router.post("", response_model=SavedItemOut, status_code=201)
def save_item(data: SavedItemCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = SavedItem(**data.model_dump(), user_id=user.id)   # user_id comes from the token
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.scalar(select(SavedItem).where(SavedItem.id == item_id, SavedItem.user_id == user.id))
    if not item:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()
    return Response(status_code=204)