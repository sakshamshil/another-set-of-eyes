from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from uuid import uuid4


class DocumentMetadata(BaseModel):
    """Metadata for a document."""
    source: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class Document(BaseModel):
    """Full document with content."""
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    title: str
    content: str = ""
    status: Literal["active", "complete"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)


class CreateDocumentRequest(BaseModel):
    """Request body for creating a document."""
    title: str
    content: str
    metadata: Optional[DocumentMetadata] = None


class CompleteDocumentRequest(BaseModel):
    """Request body for completing a document."""
    commit_message: Optional[str] = None


class DocumentSummary(BaseModel):
    """Lightweight document info for listing."""
    id: str
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    """Response for list documents endpoint."""
    documents: list[DocumentSummary]
    count: int


class CreateDocumentResponse(BaseModel):
    """Response for create document endpoint."""
    id: str
    title: str
    status: str
    url: str
    created_at: datetime


class CompleteDocumentResponse(BaseModel):
    """Response for complete document endpoint."""
    id: str
    status: str
    git: Optional[dict] = None
