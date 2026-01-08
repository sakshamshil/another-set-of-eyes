from typing import Optional
from datetime import datetime
import asyncio

from src.models import Document, CreateDocumentRequest, DocumentMetadata


class DocumentStore:
    """In-memory document storage with event broadcasting."""

    def __init__(self):
        self._documents: dict[str, Document] = {}
        self._event_queues: list[asyncio.Queue] = []

    async def subscribe(self) -> asyncio.Queue:
        """Subscribe to new document events."""
        queue = asyncio.Queue()
        self._event_queues.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        """Unsubscribe from events."""
        if queue in self._event_queues:
            self._event_queues.remove(queue)

    async def _broadcast(self, event_type: str, data: dict):
        """Broadcast event to all subscribers."""
        message = {"type": event_type, "data": data}
        for queue in self._event_queues:
            await queue.put(message)

    async def create(self, request: CreateDocumentRequest) -> Document:
        """Create a new document."""
        doc = Document(
            title=request.title,
            content=request.content,
            metadata=request.metadata or DocumentMetadata()
        )
        self._documents[doc.id] = doc

        # Emit event
        await self._broadcast("new_document", {
            "id": doc.id,
            "title": doc.title
        })

        return doc

    def get(self, doc_id: str) -> Optional[Document]:
        """Get a document by ID."""
        return self._documents.get(doc_id)

    def list(self, status: Optional[str] = None) -> list[Document]:
        """List all documents, optionally filtered by status."""
        docs = list(self._documents.values())
        if status:
            docs = [d for d in docs if d.status == status]
        return sorted(docs, key=lambda d: d.updated_at, reverse=True)

    def complete(self, doc_id: str) -> Optional[Document]:
        """Mark a document as complete."""
        doc = self._documents.get(doc_id)
        if doc:
            doc.status = "complete"
            doc.updated_at = datetime.utcnow()
        return doc

    def delete(self, doc_id: str) -> bool:
        """Delete a document. Returns True if deleted."""
        if doc_id in self._documents:
            del self._documents[doc_id]
            return True
        return False

    def find_by_path(self, path: str) -> Optional[Document]:
        """Find a document by its metadata path."""
        for doc in self._documents.values():
            if doc.metadata.path == path:
                return doc
        return None

    def update(self, doc_id: str, title: str, content: str) -> Optional[Document]:
        """Update a document's title and content."""
        doc = self._documents.get(doc_id)
        if doc:
            doc.title = title
            doc.content = content
            doc.updated_at = datetime.utcnow()
        return doc

    def rename(self, doc_id: str, new_title: str) -> Optional[Document]:
        """Rename a document (update title only)."""
        doc = self._documents.get(doc_id)
        if doc:
            doc.title = new_title
            doc.updated_at = datetime.utcnow()
        return doc

    def clear_all(self) -> int:
        """Delete all documents. Returns count of deleted docs."""
        count = len(self._documents)
        self._documents.clear()
        return count


# Singleton instance
store = DocumentStore()
