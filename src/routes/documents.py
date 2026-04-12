import asyncio
import json
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.db_models import User
from src.dependencies import get_current_user
from src.models import (
    CompleteDocumentRequest,
    CompleteDocumentResponse,
    CreateDocumentRequest,
    CreateDocumentResponse,
    Document,
    DocumentListResponse,
    DocumentSummary,
)
from src.services.document_store import DocumentStore, subscribe, unsubscribe
from src.services.git_service import save_and_commit

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/stream")
async def stream_events(
    request: Request,
    user: User = Depends(get_current_user),
):
    """SSE endpoint — accepts ?token=<phrase> since EventSource can't set headers."""
    async def event_generator():
        queue = subscribe(user.id)
        try:
            while True:
                if await request.is_disconnected():
                    break
                message = await queue.get()
                yield f"data: {json.dumps(message)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(user.id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("", response_model=CreateDocumentResponse)
async def create_document(
    request: Request,
    body: CreateDocumentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = DocumentStore(db, user.id)

    existing = None
    if body.metadata and body.metadata.path:
        existing = await store.find_by_path(body.metadata.path)

    if existing:
        doc = await store.update(existing.id, body.title, body.content)
    else:
        doc = await store.create(body)

    base_url = str(request.base_url).rstrip("/")
    return CreateDocumentResponse(
        id=doc.id,
        title=doc.title,
        status=doc.status,
        url=f"{base_url}/doc/{doc.id}",
        created_at=doc.created_at,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    status: Optional[Literal["active", "complete"]] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = DocumentStore(db, user.id)
    docs = await store.list(status=status)
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
async def get_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = DocumentStore(db, user.id)
    doc = await store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.put("/{doc_id}", response_model=Document)
async def update_document(
    doc_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    title = body.get("title")
    content = body.get("content")
    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    store = DocumentStore(db, user.id)
    doc = await store.update(doc_id, title, content)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{doc_id}/complete", response_model=CompleteDocumentResponse)
async def complete_document(
    doc_id: str,
    body: Optional[CompleteDocumentRequest] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = DocumentStore(db, user.id)
    doc = await store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await store.complete(doc_id)
    commit_message = body.commit_message if body else None
    git_result = await save_and_commit(doc, commit_message)

    return CompleteDocumentResponse(id=doc.id, status="complete", git=git_result)


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = DocumentStore(db, user.id)
    if not await store.delete(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")


@router.delete("", status_code=200)
async def clear_all_documents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = DocumentStore(db, user.id)
    count = await store.clear_all()
    return {"deleted": count}


@router.patch("/{doc_id}")
async def rename_document(
    doc_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_title = body.get("title")
    if not new_title:
        raise HTTPException(status_code=400, detail="Title is required")

    store = DocumentStore(db, user.id)
    doc = await store.rename(doc_id, new_title)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"id": doc.id, "title": doc.title}
