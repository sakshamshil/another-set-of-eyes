# Document Viewer Server - Specification

> A simple server that lets AI assistants push documents to a beautiful web UI for comfortable reading on secondary displays.

---

## Problem Statement

When AI assistants generate long-form content (architecture docs, implementation plans, tutorials), the terminal experience is suboptimal:
- Small viewport makes reading difficult
- Content scrolls away as work continues
- No way to reference docs while working in the same terminal
- Markdown rendering is limited

## Solution

A lightweight server where:
1. AI assistant pushes completed documents via HTTP API
2. User opens web UI on iPad/second monitor
3. Documents render beautifully with syntax highlighting
4. Completed docs auto-commit to git for permanent storage

---

## Decisions (Locked In)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Backend** | Python + FastAPI | User preference, good async support |
| **Frontend** | Vanilla HTML/CSS/JS | Zero build step, no npm, no bundler |
| **Markdown** | marked.js (CDN) | Fast, reliable, GFM support |
| **Syntax Highlighting** | highlight.js (CDN) | GitHub-dark theme, 190+ languages |
| **Styling** | GitHub-style | Clean, familiar, readable |
| **Deployment** | Single app on Render (free tier) | FastAPI serves both API and static files |
| **Git Storage** | `./documents` folder | Same repo, auto-commit on complete |
| **Streaming** | None | Documents pushed complete, not streamed |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Render (Single Deployment)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   FastAPI Server                                            │
│   │                                                         │
│   ├── Static File Serving                                   │
│   │   ├── GET /              → index.html (dashboard)       │
│   │   ├── GET /doc/{id}      → doc.html (viewer)            │
│   │   └── GET /static/*      → css, js files                │
│   │                                                         │
│   ├── REST API                                              │
│   │   ├── POST   /api/documents           (create)          │
│   │   ├── GET    /api/documents           (list)            │
│   │   ├── GET    /api/documents/{id}      (read)            │
│   │   ├── POST   /api/documents/{id}/complete (git commit)  │
│   │   └── DELETE /api/documents/{id}      (remove)          │
│   │                                                         │
│   └── Git Integration                                       │
│       └── Auto-commits to ./documents on complete           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ▲                              │
         │ Push document                │ Serve UI
         │                              ▼
┌─────────────────┐            ┌─────────────────┐
│  Claude Code    │            │  iPad/Browser   │
│  (API calls)    │            │  (reads docs)   │
└─────────────────┘            └─────────────────┘
```

---

## File Structure

```
md-mcp/
├── src/
│   ├── __init__.py
│   ├── main.py                 # FastAPI entry point, static file serving
│   ├── models.py               # Pydantic models
│   ├── routes/
│   │   ├── __init__.py
│   │   └── documents.py        # Document CRUD endpoints
│   └── services/
│       ├── __init__.py
│       ├── document_store.py   # In-memory document storage
│       └── git_service.py      # Git commit operations
├── static/
│   ├── index.html              # Dashboard page
│   ├── doc.html                # Document viewer page
│   ├── css/
│   │   └── style.css           # GitHub-style theme
│   └── js/
│       └── app.js              # Fetch + render logic
├── documents/                   # Git-tracked completed docs
│   └── .gitkeep
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Data Models

### Pydantic Models

```python
# src/models.py
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from uuid import uuid4


class DocumentMetadata(BaseModel):
    source: Optional[str] = None          # "claude-code", "cursor", etc.
    tags: list[str] = Field(default_factory=list)


class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    title: str
    content: str = ""
    status: Literal["active", "complete"] = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)


class CreateDocumentRequest(BaseModel):
    title: str
    content: str
    metadata: Optional[DocumentMetadata] = None


class CompleteDocumentRequest(BaseModel):
    commit_message: Optional[str] = None


class DocumentSummary(BaseModel):
    """Lightweight document info for listing."""
    id: str
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    documents: list[DocumentSummary]
    count: int


class CreateDocumentResponse(BaseModel):
    id: str
    title: str
    status: str
    url: str
    created_at: datetime


class CompleteDocumentResponse(BaseModel):
    id: str
    status: str
    git: Optional[dict] = None  # {"committed": true, "path": "...", "sha": "..."}
```

---

## API Specification

### Base URL
- **Local:** `http://localhost:8000`
- **Production:** `https://your-app.onrender.com`

---

### `POST /api/documents` - Create Document

Creates a new document with full content.

**Request:**
```json
{
  "title": "API Refactoring Plan",
  "content": "# API Refactoring Plan\n\n## Overview\n\nThis document outlines...",
  "metadata": {
    "source": "claude-code",
    "tags": ["architecture", "api"]
  }
}
```

**Response (201 Created):**
```json
{
  "id": "a1b2c3d4",
  "title": "API Refactoring Plan",
  "status": "active",
  "url": "https://your-app.railway.app/doc/a1b2c3d4",
  "created_at": "2024-01-03T10:30:00Z"
}
```

---

### `GET /api/documents` - List Documents

Returns all documents, optionally filtered.

**Query Parameters:**
- `status` (optional): `active` | `complete`

**Response (200 OK):**
```json
{
  "documents": [
    {
      "id": "a1b2c3d4",
      "title": "API Refactoring Plan",
      "status": "active",
      "created_at": "2024-01-03T10:30:00Z",
      "updated_at": "2024-01-03T10:30:00Z"
    }
  ],
  "count": 1
}
```

---

### `GET /api/documents/{id}` - Get Document

Returns full document with content.

**Response (200 OK):**
```json
{
  "id": "a1b2c3d4",
  "title": "API Refactoring Plan",
  "content": "# API Refactoring Plan\n\n## Overview\n\n...",
  "status": "active",
  "created_at": "2024-01-03T10:30:00Z",
  "updated_at": "2024-01-03T10:30:00Z",
  "metadata": {
    "source": "claude-code",
    "tags": ["architecture", "api"]
  }
}
```

**Response (404 Not Found):**
```json
{
  "detail": "Document not found"
}
```

---

### `POST /api/documents/{id}/complete` - Complete Document

Marks document as complete and triggers git commit.

**Request:**
```json
{
  "commit_message": "docs: Add API refactoring plan"
}
```

**Response (200 OK):**
```json
{
  "id": "a1b2c3d4",
  "status": "complete",
  "git": {
    "committed": true,
    "path": "documents/2024-01-03-api-refactoring-plan.md",
    "sha": "abc1234"
  }
}
```

---

### `DELETE /api/documents/{id}` - Delete Document

Removes document from memory. Does not affect git-committed files.

**Response (204 No Content)**

---

## Backend Implementation

### Main Application

```python
# src/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from src.routes import documents

app = FastAPI(title="Document Viewer")

# API routes
app.include_router(documents.router, prefix="/api")

# Static files (CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")


# HTML pages
@app.get("/")
async def dashboard():
    """Serve the dashboard page."""
    return FileResponse("static/index.html")


@app.get("/doc/{doc_id}")
async def document_page(doc_id: str):
    """Serve the document viewer page."""
    return FileResponse("static/doc.html")
```

---

### Document Store

```python
# src/services/document_store.py
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


# Singleton instance
store = DocumentStore()
```

---

### Git Service

```python
# src/services/git_service.py
import subprocess
import re
from pathlib import Path
from src.models import Document

DOCUMENTS_DIR = Path("./documents")


def slugify(title: str) -> str:
    """Convert title to URL-safe slug."""
    slug = title.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')[:50]


def save_and_commit(doc: Document, commit_message: Optional[str] = None) -> dict:
    """
    Save document to file and commit to git.

    Returns dict with commit info or error.
    """
    # Ensure documents directory exists
    DOCUMENTS_DIR.mkdir(exist_ok=True)

    # Generate filename
    date_str = doc.created_at.strftime("%Y-%m-%d")
    slug = slugify(doc.title)
    filename = f"{date_str}-{slug}.md"
    filepath = DOCUMENTS_DIR / filename

    # Generate YAML front matter
    tags_yaml = "\n".join(f"  - {tag}" for tag in doc.metadata.tags)
    front_matter = f"""---
title: "{doc.title}"
created: {doc.created_at.isoformat()}Z
source: {doc.metadata.source or 'unknown'}
tags:
{tags_yaml if tags_yaml else '  []'}
---

"""

    # Write file
    filepath.write_text(front_matter + doc.content, encoding="utf-8")

    # Git operations
    try:
        message = commit_message or f"docs: Add {doc.title}"

        subprocess.run(
            ["git", "add", str(filepath)],
            check=True,
            capture_output=True
        )

        subprocess.run(
            ["git", "commit", "-m", message],
            check=True,
            capture_output=True
        )

        # Get commit SHA
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True
        )
        sha = result.stdout.strip()[:7]

        return {
            "committed": True,
            "path": str(filepath),
            "sha": sha
        }

    except subprocess.CalledProcessError as e:
        return {
            "committed": False,
            "error": e.stderr.decode() if e.stderr else str(e)
        }
```

---

### API Routes

```python
# src/routes/documents.py
from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from src.models import (
    CreateDocumentRequest,
    CreateDocumentResponse,
    CompleteDocumentRequest,
    CompleteDocumentResponse,
    DocumentListResponse,
    DocumentSummary,
    Document
)
from src.services.document_store import store
from src.services.git_service import save_and_commit

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
        created_at=doc.created_at
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(status: Optional[str] = None):
    """List all documents."""
    docs = store.list(status=status)

    summaries = [
        DocumentSummary(
            id=d.id,
            title=d.title,
            status=d.status,
            created_at=d.created_at,
            updated_at=d.updated_at
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
async def complete_document(doc_id: str, body: CompleteDocumentRequest = None):
    """Mark document as complete and commit to git."""
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Mark as complete
    store.complete(doc_id)

    # Commit to git
    commit_message = body.commit_message if body else None
    git_result = save_and_commit(doc, commit_message)

    return CompleteDocumentResponse(
        id=doc.id,
        status="complete",
        git=git_result
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: str):
    """Delete a document."""
    if not store.delete(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
```

---

## Frontend Implementation

### Dashboard (index.html)

```html
<!-- static/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Viewer</title>
  <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>Documents</h1>
      <button id="refresh-btn" class="btn">Refresh</button>
    </header>

    <main id="document-list">
      <p class="loading">Loading documents...</p>
    </main>

    <footer>
      <p class="empty-state" id="empty-state" style="display: none;">
        No documents yet. Waiting for Claude to push content...
      </p>
    </footer>
  </div>

  <script src="/static/js/app.js"></script>
</body>
</html>
```

---

### Document Viewer (doc.html)

```html
<!-- static/doc.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>

  <!-- Styles -->
  <link rel="stylesheet" href="/static/css/style.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
</head>
<body>
  <div class="container doc-view">
    <header>
      <a href="/" class="back-link">&larr; Back</a>
      <h1 id="doc-title">Loading...</h1>
      <span id="doc-status" class="status-badge">-</span>
    </header>

    <article id="doc-content" class="markdown-body">
      <p class="loading">Loading document...</p>
    </article>
  </div>

  <!-- Markdown rendering -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

  <script>
    // Get document ID from URL path
    const pathParts = window.location.pathname.split('/');
    const docId = pathParts[pathParts.length - 1];

    // Configure marked with syntax highlighting
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true
    });

    // Load and render document
    async function loadDocument() {
      try {
        const res = await fetch(`/api/documents/${docId}`);

        if (!res.ok) {
          throw new Error('Document not found');
        }

        const doc = await res.json();

        document.getElementById('doc-title').textContent = doc.title;
        document.getElementById('doc-status').textContent = doc.status;
        document.getElementById('doc-status').className = `status-badge status-${doc.status}`;
        document.getElementById('doc-content').innerHTML = marked.parse(doc.content);
        document.title = doc.title;

      } catch (err) {
        document.getElementById('doc-content').innerHTML = `
          <p class="error">Error: ${err.message}</p>
          <a href="/">Back to dashboard</a>
        `;
      }
    }

    loadDocument();
  </script>
</body>
</html>
```

---

### Dashboard JavaScript

```javascript
// static/js/app.js

// Relative time formatting
function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Render document list
function renderDocuments(documents) {
  const container = document.getElementById('document-list');
  const emptyState = document.getElementById('empty-state');

  if (documents.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  container.innerHTML = documents.map(doc => `
    <a href="/doc/${doc.id}" class="doc-card">
      <div class="doc-card-header">
        <span class="status-indicator status-${doc.status}"></span>
        <h2>${escapeHtml(doc.title)}</h2>
      </div>
      <div class="doc-card-meta">
        <span class="time">${timeAgo(doc.updated_at)}</span>
        <span class="status">${doc.status}</span>
      </div>
    </a>
  `).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Fetch documents from API
async function fetchDocuments() {
  try {
    const res = await fetch('/api/documents');
    const data = await res.json();
    renderDocuments(data.documents);
  } catch (err) {
    document.getElementById('document-list').innerHTML = `
      <p class="error">Failed to load documents: ${err.message}</p>
    `;
  }
}

// Initial load
fetchDocuments();

// Refresh button
document.getElementById('refresh-btn').addEventListener('click', fetchDocuments);

// Auto-refresh every 30 seconds
setInterval(fetchDocuments, 30000);
```

---

### Styles (GitHub-inspired)

```css
/* static/css/style.css */

/* === Reset & Base === */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* Dark theme (default) */
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --text-primary: #c9d1d9;
  --text-secondary: #8b949e;
  --text-link: #58a6ff;
  --border-color: #30363d;
  --status-active: #3fb950;
  --status-complete: #8b949e;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg-primary: #ffffff;
    --bg-secondary: #f6f8fa;
    --bg-tertiary: #eaeef2;
    --text-primary: #24292f;
    --text-secondary: #57606a;
    --text-link: #0969da;
    --border-color: #d0d7de;
    --status-active: #1a7f37;
    --status-complete: #57606a;
  }
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-primary);
  min-height: 100vh;
}

/* === Layout === */
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

header h1 {
  font-size: 24px;
  font-weight: 600;
}

/* === Buttons === */
.btn {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.btn:hover {
  background: var(--border-color);
}

/* === Document Cards === */
.doc-card {
  display: block;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 12px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s;
}

.doc-card:hover {
  border-color: var(--text-link);
}

.doc-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.doc-card-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-link);
}

.doc-card-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* === Status Indicators === */
.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator.status-active {
  background: var(--status-active);
}

.status-indicator.status-complete {
  background: var(--status-complete);
}

.status-badge {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.status-badge.status-active {
  background: rgba(63, 185, 80, 0.2);
  color: var(--status-active);
}

/* === Document View === */
.doc-view header {
  flex-wrap: wrap;
  gap: 12px;
}

.back-link {
  color: var(--text-link);
  text-decoration: none;
  font-size: 14px;
}

.back-link:hover {
  text-decoration: underline;
}

.doc-view header h1 {
  flex: 1;
  min-width: 200px;
}

/* === Markdown Body (GitHub-style) === */
.markdown-body {
  font-size: 16px;
  line-height: 1.6;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body h1 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border-color);
}

.markdown-body h2 {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border-color);
}

.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }

.markdown-body p {
  margin-bottom: 16px;
}

.markdown-body a {
  color: var(--text-link);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body ul,
.markdown-body ol {
  margin-bottom: 16px;
  padding-left: 2em;
}

.markdown-body li {
  margin-bottom: 4px;
}

.markdown-body blockquote {
  margin: 0 0 16px 0;
  padding: 0 1em;
  color: var(--text-secondary);
  border-left: 4px solid var(--border-color);
}

.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 85%;
  background: var(--bg-tertiary);
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

.markdown-body pre {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.markdown-body pre code {
  background: transparent;
  padding: 0;
  font-size: 85%;
  line-height: 1.45;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body th {
  background: var(--bg-secondary);
  font-weight: 600;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 24px 0;
}

.markdown-body img {
  max-width: 100%;
  height: auto;
}

/* === Utility === */
.loading {
  color: var(--text-secondary);
  font-style: italic;
}

.error {
  color: #f85149;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 48px 0;
}

/* === Mobile === */
@media (max-width: 600px) {
  .container {
    padding: 16px;
  }

  header h1 {
    font-size: 20px;
  }

  .markdown-body {
    font-size: 15px;
  }
}
```

---

## Deployment

### Requirements

```
# requirements.txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install git
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# Configure git for commits
RUN git config --global user.email "docviewer@example.com" && \
    git config --global user.name "Document Viewer"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Ensure documents directory exists and is a git repo
RUN mkdir -p documents && \
    cd documents && \
    git init

# Expose port
EXPOSE 8000

# Run server
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Render Deployment

Render's free tier spins down after 15 minutes of inactivity (~30s cold start).

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Configure:
   - **Environment:** Docker
   - **Instance Type:** Free
   - **Health Check Path:** `/api/documents`
5. Deploy
6. Get public URL: `https://your-app.onrender.com`

**Note:** First request after idle period takes ~30 seconds. Subsequent requests are fast.

---

## Usage

### From Claude Code (via curl)

```bash
# Create a document
curl -X POST https://your-app.onrender.com/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Implementation Plan",
    "content": "# Implementation Plan\n\n## Overview\n\nThis is the plan...",
    "metadata": {"source": "claude-code", "tags": ["planning"]}
  }'

# Response: {"id": "a1b2c3d4", "url": "https://your-app.onrender.com/doc/a1b2c3d4", ...}

# View in browser: https://your-app.onrender.com/doc/a1b2c3d4

# When done, commit to git
curl -X POST https://your-app.onrender.com/api/documents/a1b2c3d4/complete \
  -H "Content-Type: application/json" \
  -d '{"commit_message": "docs: Add implementation plan"}'
```

### From iPad

1. Open `https://your-app.onrender.com` in Safari
2. See dashboard with all documents
3. Tap a document to read it
4. Pull down to refresh, or wait for auto-refresh

---

## Implementation Phases

### Phase 1: Backend
- [ ] Create project structure
- [ ] Implement models.py
- [ ] Implement document_store.py
- [ ] Implement documents.py routes
- [ ] Implement main.py with static file serving
- [ ] Test with curl

### Phase 2: Frontend
- [ ] Create index.html (dashboard)
- [ ] Create doc.html (viewer)
- [ ] Create style.css (GitHub theme)
- [ ] Create app.js (dashboard logic)
- [ ] Test in browser

### Phase 3: Git Integration
- [ ] Implement git_service.py
- [ ] Test complete endpoint with git commit
- [ ] Create documents/.gitkeep

### Phase 4: Deployment
- [ ] Create Dockerfile
- [ ] Create requirements.txt
- [ ] Deploy to Render (free tier)
- [ ] Test from iPad

### Phase 5: MCP Wrapper (Future)
- [ ] Create MCP server that wraps HTTP API
- [ ] Register as Claude Code MCP server

---

## Testing Checklist

- [ ] `POST /api/documents` creates document and returns ID
- [ ] `GET /api/documents` lists all documents
- [ ] `GET /api/documents/{id}` returns full document
- [ ] `POST /api/documents/{id}/complete` commits to git
- [ ] `DELETE /api/documents/{id}` removes document
- [ ] Dashboard loads and shows documents
- [ ] Document viewer renders markdown correctly
- [ ] Syntax highlighting works
- [ ] Dark/light mode follows system preference
- [ ] Works on iPad Safari
- [ ] Auto-refresh works on dashboard
