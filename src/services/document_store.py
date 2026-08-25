import asyncio
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.db_models import Document as DocumentORM
from src.models import Document, CreateDocumentRequest, DocumentMetadata

# Per-user SSE queues — in-memory, keyed by user_id string.
# Queues are transient: they live only as long as a client is connected.
_event_queues: dict[str, list[asyncio.Queue]] = {}


def subscribe(user_id) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    uid = str(user_id)
    if uid not in _event_queues:
        _event_queues[uid] = []
    _event_queues[uid].append(queue)
    return queue


def unsubscribe(user_id, queue: asyncio.Queue):
    uid = str(user_id)
    if uid in _event_queues and queue in _event_queues[uid]:
        _event_queues[uid].remove(queue)


async def broadcast(user_id, event_type: str, data: dict):
    uid = str(user_id)
    message = {"type": event_type, "data": data}
    for queue in _event_queues.get(uid, []):
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            pass  # Slow/disconnected client — drop event rather than block


def _to_pydantic(doc: DocumentORM) -> Document:
    return Document(
        id=doc.id,
        title=doc.title,
        content=doc.content,
        status=doc.status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        metadata=DocumentMetadata(
            source=doc.source,
            tags=doc.tags or [],
            path=doc.path,
        ),
    )


class DocumentStore:
    """DB-backed document store scoped to a single user."""

    def __init__(self, db: AsyncSession, user_id):
        self.db = db
        self.user_id = user_id

    async def create(self, request: CreateDocumentRequest) -> Document:
        meta = request.metadata or DocumentMetadata()
        doc_orm = DocumentORM(
            id=str(uuid4()).replace("-", "")[:16],
            user_id=self.user_id,
            title=request.title,
            content=request.content,
            source=meta.source,
            tags=meta.tags,
            path=meta.path,
        )
        self.db.add(doc_orm)
        await self.db.commit()
        await self.db.refresh(doc_orm)

        doc = _to_pydantic(doc_orm)
        await broadcast(self.user_id, "new_document", {"id": doc.id, "title": doc.title})
        return doc

    async def get(self, doc_id: str) -> Optional[Document]:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.id == doc_id,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        return _to_pydantic(doc_orm) if doc_orm else None

    async def list(self, status: Optional[str] = None) -> list[Document]:
        q = select(DocumentORM).where(DocumentORM.user_id == self.user_id)
        if status:
            q = q.where(DocumentORM.status == status)
        q = q.order_by(DocumentORM.updated_at.desc())
        result = await self.db.execute(q)
        return [_to_pydantic(d) for d in result.scalars().all()]

    async def update(self, doc_id: str, title: str, content: str) -> Optional[Document]:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.id == doc_id,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        if not doc_orm:
            return None
        doc_orm.title = title
        doc_orm.content = content
        doc_orm.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(doc_orm)
        doc = _to_pydantic(doc_orm)
        # Re-pushing the same file path lands here, not in create(). Without this
        # an open tab never hears about it and sits on stale content.
        await broadcast(self.user_id, "document_updated", {"id": doc.id, "title": doc.title})
        return doc

    async def archive(self, doc_id: str) -> Optional[Document]:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.id == doc_id,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        if not doc_orm:
            return None
        doc_orm.status = "archived"
        doc_orm.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(doc_orm)
        doc = _to_pydantic(doc_orm)
        await broadcast(self.user_id, "document_updated", {"id": doc.id, "title": doc.title})
        return doc

    async def unarchive(self, doc_id: str) -> Optional[Document]:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.id == doc_id,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        if not doc_orm:
            return None
        doc_orm.status = "active"
        doc_orm.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(doc_orm)
        doc = _to_pydantic(doc_orm)
        await broadcast(self.user_id, "document_updated", {"id": doc.id, "title": doc.title})
        return doc

    async def delete(self, doc_id: str) -> bool:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.id == doc_id,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        if not doc_orm:
            return False
        await self.db.delete(doc_orm)
        await self.db.commit()
        await broadcast(self.user_id, "document_deleted", {"id": doc_id})
        return True

    async def find_by_path(self, path: str) -> Optional[Document]:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.path == path,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        return _to_pydantic(doc_orm) if doc_orm else None

    async def rename(self, doc_id: str, new_title: str) -> Optional[Document]:
        result = await self.db.execute(
            select(DocumentORM).where(
                DocumentORM.id == doc_id,
                DocumentORM.user_id == self.user_id,
            )
        )
        doc_orm = result.scalar_one_or_none()
        if not doc_orm:
            return None
        doc_orm.title = new_title
        doc_orm.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(doc_orm)
        doc = _to_pydantic(doc_orm)
        await broadcast(self.user_id, "document_updated", {"id": doc.id, "title": doc.title})
        return doc

    async def clear_all(self) -> int:
        result = await self.db.execute(
            select(DocumentORM).where(DocumentORM.user_id == self.user_id)
        )
        count = len(result.scalars().all())
        await self.db.execute(
            delete(DocumentORM).where(DocumentORM.user_id == self.user_id)
        )
        await self.db.commit()
        await broadcast(self.user_id, "documents_cleared", {"count": count})
        return count
