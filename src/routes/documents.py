from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from src.models import (
    CreateDocumentRequest,
    CreateDocumentResponse,
    CompleteDocumentRequest,
    CompleteDocumentResponse,
    DocumentListResponse,
    DocumentSummary,
    Document,
)
from src.services.document_store import store

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=CreateDocumentResponse, status_code=201)
async def create_document(request: Request, body: CreateDocumentRequest):
    """Create a new document."""
    doc = store.create(body)

    # Build URL from request
    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/doc/{doc.id}"

    return CreateDocumentResponse(
        id=doc.id,
        title=doc.title,
        status=doc.status,
        url=url,
        created_at=doc.created_at,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(status: Optional[str] = None):
    """List all documents, optionally filtered by status."""
    docs = store.list(status=status)

    summaries = [
        DocumentSummary(
            id=d.id,
            title=d.title,
            status=d.status,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in docs
    ]

    return DocumentListResponse(documents=summaries, count=len(summaries))


@router.get("/{doc_id}", response_model=Document)
async def get_document(doc_id: str):
    """Get a document by ID."""
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{doc_id}/complete", response_model=CompleteDocumentResponse)
async def complete_document(doc_id: str, body: Optional[CompleteDocumentRequest] = None):
    """Mark document as complete. Git integration added in Phase 3."""
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Mark as complete
    store.complete(doc_id)

    # Git integration will be added in Phase 3
    # For now, return null for git field
    return CompleteDocumentResponse(
        id=doc.id,
        status="complete",
        git=None,
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: str):
    """Delete a document."""
    if not store.delete(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
