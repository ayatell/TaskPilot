import io
import logging

from pypdf import PdfReader
from pypdf.errors import PyPdfError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, defer

from app.models import Chunk, Document

logger = logging.getLogger(__name__)

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
CHUNK_SIZE = 700
CHUNK_OVERLAP = 100
MAX_DOCUMENTS = 3          # per student
MAX_CHUNKS = 400           # protects memory on huge PDFs

_model = None


class DocumentReadError(Exception):
    """PDF illisible, chiffré, ou sans texte extractible."""


class DocumentLimitError(Exception):
    """Le nombre maximum de documents est atteint."""


# ---------- embeddings ----------
def _get_model():
    global _model
    if _model is None:                      # loaded once, on first use
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed(texts: list[str]) -> list[list[float]]:
    vectors = _get_model().encode(texts, normalize_embeddings=True, batch_size=32)
    return [v.tolist() for v in vectors]


# ---------- extraction ----------
def _clean(text: str) -> str:
    """Supprime les octets NUL, que PostgreSQL refuse dans les colonnes texte."""
    return text.replace("\x00", "")


def _extract_text(filename: str, data: bytes) -> str:
    if not filename.lower().endswith(".pdf"):          # .txt / .md
        text = _clean(data.decode("utf-8", errors="ignore")).strip()
    else:
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted and not reader.decrypt(""):
                raise DocumentReadError("PDF chiffré")
            pages = [_clean(page.extract_text() or "") for page in reader.pages]
        except DocumentReadError:
            raise
        except (PyPdfError, ValueError, KeyError) as e:
            raise DocumentReadError(str(e)) from e
        text = "\n".join(pages).strip()

    if not text:
        raise DocumentReadError("Aucun texte extractible (PDF scanné ?)")
    return text


def _split(text: str) -> list[str]:
    text = " ".join(text.split())
    chunks, start = [], 0
    step = CHUNK_SIZE - CHUNK_OVERLAP
    while start < len(text):
        piece = text[start:start + CHUNK_SIZE].strip()
        if piece:
            chunks.append(piece)
        start += step
    return chunks[:MAX_CHUNKS]


# ---------- ingestion ----------
def ingest(db: Session, user_id: int, filename: str, data: bytes) -> Document:
    # limit checked first: no need to read or embed a file we will refuse
    count = db.scalar(select(func.count()).select_from(Document).where(Document.user_id == user_id)) or 0
    if count >= MAX_DOCUMENTS:
        raise DocumentLimitError(f"Maximum {MAX_DOCUMENTS} documents. Supprime-en un pour en ajouter un autre.")

    text = _extract_text(filename, data)
    pieces = _split(text)
    if not pieces:
        raise DocumentReadError("Document vide")

    try:
        doc = Document(user_id=user_id, filename=_clean(filename)[:255])
        db.add(doc)
        db.flush()                          # obtient doc.id sans valider

        embeddings = embed(pieces)
        db.add_all(
            Chunk(user_id=user_id, document_id=doc.id, content=piece, embedding=emb)
            for piece, emb in zip(pieces, embeddings)
        )
        db.commit()
        db.refresh(doc)
        return doc
    except Exception:
        db.rollback()                       # évite un document orphelin sans chunks
        raise


# ---------- retrieval ----------
def _scoped(user_id: int, document_ids: list[int] | None):
    q = select(Chunk).where(Chunk.user_id == user_id)      # isolation: always filtered by user
    if document_ids:
        q = q.where(Chunk.document_id.in_(document_ids))
    return q


def retrieve(db: Session, user_id: int, query: str, k: int = 6,
             document_ids: list[int] | None = None) -> str:
    chunks = db.scalars(_scoped(user_id, document_ids)).all()
    if not chunks:
        return ""                           # no documents: don't even load the model
    q = embed([query])[0]
    scored = sorted(chunks, key=lambda c: -sum(a * b for a, b in zip(q, c.embedding)))
    return "\n---\n".join(c.content for c in scored[:k])


def sample(db: Session, user_id: int, document_ids: list[int] | None = None, k: int = 16) -> str:
    """Evenly spaced chunks from EACH selected document, so every PDF is represented."""
    chunks = db.scalars(
        _scoped(user_id, document_ids).options(defer(Chunk.embedding)).order_by(Chunk.document_id, Chunk.id)
    ).all()
    if not chunks:
        return ""
    by_doc: dict[int, list[Chunk]] = {}
    for c in chunks:
        by_doc.setdefault(c.document_id, []).append(c)
    per_doc = max(2, k // len(by_doc))
    picked: list[Chunk] = []
    for group in by_doc.values():
        if len(group) > per_doc:
            step = len(group) / per_doc
            group = [group[int(i * step)] for i in range(per_doc)]
        picked.extend(group)
    return "\n---\n".join(c.content for c in picked)