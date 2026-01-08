from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional
import asyncio
import json

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
from src.services.git_service import save_and_commit

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/stream")
async def stream_events(request: Request):
    """SSE endpoint for real-time updates."""
    async def event_generator():
        queue = await store.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                
                # Wait for message
                message = await queue.get()
                yield f"data: {json.dumps(message)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            store.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("", response_model=CreateDocumentResponse)
async def create_document(request: Request, body: CreateDocumentRequest):
    """Create or update a document. If metadata.path matches existing doc, updates it."""
    # Check for existing document with same path (upsert)
    existing_doc = None
    if body.metadata and body.metadata.path:
        existing_doc = store.find_by_path(body.metadata.path)

    if existing_doc:
        # Update existing document
        doc = store.update(existing_doc.id, body.title, body.content)
    else:
        # Create new document
        doc = await store.create(body)

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
    """Mark document as complete and commit to git."""
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Mark as complete
    store.complete(doc_id)

    # Save to file and commit to git/GitHub
    commit_message = body.commit_message if body else None
    git_result = await save_and_commit(doc, commit_message)

    return CompleteDocumentResponse(
        id=doc.id,
        status="complete",
        git=git_result,
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: str):
    """Delete a document."""
    if not store.delete(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")


@router.delete("", status_code=200)
async def clear_all_documents():
    """Delete all documents."""
    count = store.clear_all()
    return {"deleted": count}


@router.patch("/{doc_id}")
async def rename_document(doc_id: str, body: dict):
    """Rename a document (update title only)."""
    new_title = body.get("title")
    if not new_title:
        raise HTTPException(status_code=400, detail="Title is required")
    
    doc = store.rename(doc_id, new_title)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {"id": doc.id, "title": doc.title}
