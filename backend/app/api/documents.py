import logging

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Document, User
from app.schemas import DocumentOut
from app.services import rag

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])

MAX_SIZE = 10 * 1024 * 1024  # 10 Mo (aligné avec l'interface)


@router.post("", response_model=DocumentOut, status_code=201)
async def upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = await file.read(MAX_SIZE + 1)    # ne lit jamais plus que la limite en mémoire
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "File too large (max 10 MB)")

    try:
        return rag.ingest(db, user.id, file.filename or "document", data)
    except rag.DocumentLimitError as e:
        # 409 = conflit avec l'état actuel (limite atteinte)
        raise HTTPException(409, str(e))
    except rag.DocumentReadError as e:
        logger.warning("Unreadable document: %s", e)
        raise HTTPException(
            422, f"This file could not be read ({e}). Is it an encrypted, scanned or damaged PDF?"
        )
    except Exception:
        db.rollback()
        logger.exception("Document ingestion failed")
        raise HTTPException(500, "Document ingestion failed, check the server logs")


@router.get("", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.scalars(
        select(Document).where(Document.user_id == user.id).order_by(Document.id.desc())
    ).all()


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.scalar(select(Document).where(Document.id == doc_id, Document.user_id == user.id))
    if not doc:
        raise HTTPException(404, "Document not found")      # 404, jamais 403
    db.delete(doc)                                           # ses chunks partent avec ON DELETE CASCADE
    db.commit()
    return Response(status_code=204)