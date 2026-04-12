from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from uuid import uuid4

# Shared field definitions
_TITLE = Field(..., min_length=1, max_length=500)
_CONTENT = Field(..., max_length=1_000_000)  # 1 MB ceiling


class DocumentMetadata(BaseModel):
    """Metadata for a document."""
    source: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    path: Optional[str] = None  # Folder path like "project-a/specs"


class Document(BaseModel):
    """Full document with content."""
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    title: str
    content: str = ""
    status: Literal["active", "archived"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)


class CreateDocumentRequest(BaseModel):
    """Request body for creating a document."""
    title: str = _TITLE
    content: str = _CONTENT
    metadata: Optional[DocumentMetadata] = None


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


class AuthRequest(BaseModel):
    """Request body for phrase authentication."""
    phrase: str = Field(..., min_length=10, max_length=1000)
