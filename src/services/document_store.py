from typing import Optional
from datetime import datetime

from src.models import Document, CreateDocumentRequest, DocumentMetadata


class DocumentStore:
    """In-memory document storage."""

    def __init__(self):
        self._documents: dict[str, Document] = {}

    def create(self, request: CreateDocumentRequest) -> Document:
        """Create a new document."""
        doc = Document(
            title=request.title,
            content=request.content,
            metadata=request.metadata or DocumentMetadata()
        )
        self._documents[doc.id] = doc
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


# Singleton instance
store = DocumentStore()
