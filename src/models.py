from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from uuid import uuid4

# Shared field definitions
_TITLE = Field(..., min_length=1, max_length=500)
_CONTENT = Field(..., max_length=5_000_000)  # 5 MB ceiling — HTML often inlines images as base64
_KIND = Literal["markdown", "html"]


class DocumentMetadata(BaseModel):
    """Metadata for a document."""
    source: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    path: Optional[str] = None  # Folder path like "project-a/specs"
    kind: Optional[_KIND] = None  # Agents set "html" to render the file as a page


class Document(BaseModel):
    """Full document with content."""
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    title: str
    content: str = ""
    status: Literal["active", "archived"] = "active"
    kind: _KIND = "markdown"
    render_key: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)


class CreateDocumentRequest(BaseModel):
    """Request body for creating a document."""
    title: str = _TITLE
    content: str = _CONTENT
    metadata: Optional[DocumentMetadata] = None


class UpdateDocumentRequest(BaseModel):
    """Request body for updating a document's title and content."""
    title: str = _TITLE
    content: str = _CONTENT


class RenameDocumentRequest(BaseModel):
    """Request body for renaming a document."""
    title: str = Field(..., min_length=1, max_length=500)


class DocumentSummary(BaseModel):
    """Lightweight document info for listing."""
    id: str
    title: str
    status: str
    kind: _KIND = "markdown"
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
    kind: _KIND = "markdown"
    url: str
    render_url: Optional[str] = None  # Passphrase-free URL — only set for HTML docs
    created_at: datetime


class AuthRequest(BaseModel):
    """Request body for phrase authentication."""
    phrase: str = Field(..., min_length=12, max_length=1000)
