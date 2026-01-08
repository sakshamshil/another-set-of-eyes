# Another Set of Eyes - Complete Architecture

A deep dive into how every component works, from HTTP request to rendered markdown on your iPad.

---

## High-Level Overview

```
┌─────────────────┐     ┌─────────────────────────────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│           FastAPI on Render             │────▶│   GitHub API    │
│  (push-doc)     │     │                                         │     │  (persistence)  │
│                 │     │  ┌─────────┐  ┌──────────┐  ┌────────┐ │     └─────────────────┘
│  Python stdlib  │     │  │ Routes  │  │ Services │  │ Store  │ │
│  urllib.request │     │  │ (API+   │  │ (git,    │  │ (dict) │ │
└─────────────────┘     │  │  HTML)  │  │  github) │  │        │ │
                        │  └─────────┘  └──────────┘  └────────┘ │
                        └──────────────────┬──────────────────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │   Web Browser   │
                                  │  (iPad/Phone)   │
                                  │                 │
                                  │  HTMX + Jinja2  │
                                  │  marked.js      │
                                  │  highlight.js   │
                                  └─────────────────┘
```

---

## Part 1: The Backend (FastAPI)

### What is FastAPI?

FastAPI is a modern Python web framework that:
- Uses **type hints** for automatic validation (via Pydantic)
- Generates **OpenAPI docs** automatically (`/docs`)
- Supports **async/await** for non-blocking I/O
- Is extremely fast (on par with Node.js and Go)

### Entry Point: `src/main.py`

```python
app = FastAPI(title="Document Viewer")

# JSON API routes
app.include_router(documents.router, prefix="/api")

# HTML page routes
app.include_router(pages.router)

# Static files (CSS)
app.mount("/static", StaticFiles(directory=static_path))
```

This creates two route groups:
1. **API routes** (`/api/*`) - Return JSON for programmatic access
2. **Page routes** (`/`, `/doc/{id}`) - Return HTML for browsers

---

## Part 2: Data Models (Pydantic)

### What is Pydantic?

Pydantic validates data using Python type hints. When you define:

```python
class Document(BaseModel):
    id: str
    title: str
    content: str = ""
    status: Literal["active", "complete"] = "active"
    created_at: datetime
    metadata: DocumentMetadata
```

Pydantic automatically:
- Validates incoming JSON matches the schema
- Converts types (string → datetime)
- Returns 422 errors for invalid data
- Generates JSON Schema for docs

### The Document Lifecycle

```
CreateDocumentRequest  ──▶  Document  ──▶  DocumentSummary
      (input)               (stored)         (list view)
                               │
                               ▼
                     CompleteDocumentResponse
                          (with git info)
```

---

## Part 3: In-Memory Storage

### Why In-Memory?

```python
class DocumentStore:
    def __init__(self):
        self._documents: dict[str, Document] = {}
```

Documents are stored in a Python dictionary. This means:
- **Fast**: O(1) lookups by ID
- **Ephemeral**: Data lost on restart
- **Simple**: No database setup needed

### Time Window

**Documents persist until Render restarts the dyno**, which happens:
- After ~15 minutes of inactivity (free tier spin-down)
- On new deployments
- Randomly (Render maintenance)

This is intentional - documents are meant to be temporary. For permanent storage, use the `/complete` endpoint to commit to GitHub.

### Singleton Pattern

```python
store = DocumentStore()  # Created once, imported everywhere
```

All routes share the same `store` instance, ensuring data consistency.

---

## Part 4: API Routes

### Route Registration

```python
router = APIRouter(prefix="/documents", tags=["documents"])
```

This creates routes like:
- `POST /api/documents` → Create
- `GET /api/documents` → List
- `GET /api/documents/{id}` → Read
- `DELETE /api/documents/{id}` → Delete
- `POST /api/documents/{id}/complete` → Complete + Git commit

### Create Document Flow

```python
@router.post("", response_model=CreateDocumentResponse, status_code=201)
async def create_document(request: Request, body: CreateDocumentRequest):
    doc = store.create(body)
    url = f"{request.base_url}doc/{doc.id}"
    return CreateDocumentResponse(id=doc.id, url=url, ...)
```

1. FastAPI parses JSON body into `CreateDocumentRequest`
2. Pydantic validates the data
3. `store.create()` generates ID and stores document
4. Response includes the viewer URL

---

## Part 5: HTML Pages (Jinja2)

### What is Jinja2?

Jinja2 is a templating engine that renders HTML with dynamic data:

```html
<h1>{{ doc.title }}</h1>
<span>{{ doc.updated_at | timeago }}</span>
```

### Template Inheritance

```
base.html           ◄── Shared HTML structure
    │
    ├── index.html  ◄── Dashboard (document list)
    │
    └── doc.html    ◄── Document viewer
```

**base.html** defines the skeleton:
```html
<html>
<head>
  <script src="htmx.js"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  {% block content %}{% endblock %}
</body>
</html>
```

Child templates extend and fill the blocks:
```html
{% extends "base.html" %}
{% block content %}
  <h1>Documents</h1>
  ...
{% endblock %}
```

### Custom Filters

```python
def timeago(dt: datetime) -> str:
    seconds = (datetime.utcnow() - dt).total_seconds()
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    ...

templates.env.filters["timeago"] = timeago
```

Now `{{ doc.updated_at | timeago }}` outputs "5m ago".

---

## Part 6: HTMX (The Magic)

### What is HTMX?

HTMX lets you make AJAX requests using HTML attributes instead of JavaScript:

```html
<main
  hx-get="/partials/doc-list"
  hx-trigger="load, every 30s"
  hx-swap="innerHTML"
>
  Loading...
</main>
```

This does:
1. On page load → Fetch `/partials/doc-list`
2. Every 30 seconds → Fetch again (auto-refresh!)
3. Replace the inner HTML with the response

### How Partials Work

```
┌─────────────────────────────────────────┐
│  index.html (full page)                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  #document-list                   │  │
│  │                                   │  │
│  │  ← HTMX loads doc_list.html here  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

The partial (`partials/doc_list.html`) returns just the document cards:

```html
{% for doc in documents %}
<a href="/doc/{{ doc.id }}" class="doc-card">
  <h2>{{ doc.title }}</h2>
  <span>{{ doc.updated_at | timeago }}</span>
</a>
{% endfor %}
```

### Why HTMX?

- **No JavaScript to write** - Just HTML attributes
- **Server renders HTML** - No JSON→DOM conversion
- **Progressive enhancement** - Works without JS (basic functionality)
- **Smaller bundle** - 14KB vs React's 140KB+

---

## Part 7: Markdown Rendering (Client-Side)

### The Rendering Stack

```
┌──────────────────────────────────────┐
│  doc.html                            │
│                                      │
│  Raw markdown ──▶ marked.js          │
│                      │               │
│                      ▼               │
│                 HTML output          │
│                      │               │
│                      ▼               │
│               highlight.js           │
│                      │               │
│                      ▼               │
│            Syntax-highlighted code   │
└──────────────────────────────────────┘
```

### How It Works

```javascript
// Configure marked with syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    return hljs.highlight(code, { language: lang }).value;
  },
  gfm: true  // GitHub Flavored Markdown
});

// Render the content
const content = {{ doc.content | tojson }};
document.getElementById('doc-content').innerHTML = marked.parse(content);
```

1. **Jinja2** injects the raw markdown as a JSON string
2. **marked.js** parses markdown → HTML
3. **highlight.js** adds syntax colors to code blocks
4. Result is inserted into the DOM

---

## Part 8: GitHub Persistence

### Development vs Production

```python
async def save_and_commit(doc: Document, commit_message: str) -> dict:
    if settings.is_production:
        return await commit_to_github(file_path, content, message)
    else:
        return _local_git_commit(doc, file_path, content, message)
```

| Environment | Method | Where |
|-------------|--------|-------|
| Development | `subprocess` git commands | Local `documents/` folder |
| Production | GitHub REST API | `another-set-of-eyes-docs` repo |

### GitHub API Flow

```python
async def commit_to_github(file_path: str, content: str, message: str):
    # 1. Check if file exists (for updates)
    existing = await client.get(url, headers=headers)

    # 2. Prepare payload
    payload = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
    }

    # 3. Include SHA if updating existing file
    if existing.status_code == 200:
        payload["sha"] = existing.json()["sha"]

    # 4. PUT to create/update file
    response = await client.put(url, headers=headers, json=payload)
```

The GitHub Contents API requires:
- **Authorization**: Bearer token with `repo` scope
- **Base64 content**: File content must be base64 encoded
- **SHA for updates**: To update a file, you must provide the current SHA

---

## Part 9: The Skill (Claude Code Integration)

### What is a Skill?

A skill is a markdown file that teaches Claude how to perform a task:

```markdown
---
name: push-doc
description: Push markdown files to viewer
allowed-tools: Bash, Read
---

# Instructions for Claude...
```

### Why Python stdlib?

```python
python3 -c "
import urllib.request, json, re, sys
file, folder = sys.argv[1], sys.argv[2]
content = open(file).read()
# ... make HTTP request
"
```

Using only `urllib.request` (built into Python):
- Works on any machine with Python 3
- No `pip install` required
- No external dependencies
- Portable across sessions/machines

---

## Part 10: Render Deployment

### What is Render?

Render is a cloud platform that:
- Deploys from GitHub automatically
- Provides free tier (with limitations)
- Manages SSL certificates
- Handles scaling

### Deployment Configuration

**render.yaml** (or dashboard settings):
```yaml
services:
  - type: web
    name: another-set-of-eyes
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn src.main:app --host 0.0.0.0 --port $PORT
```

### Free Tier Limitations

| Limitation | Impact |
|------------|--------|
| Spin-down after 15min idle | First request after idle is slow (~30s) |
| 512MB RAM | Sufficient for this app |
| Shared CPU | Good enough for low traffic |
| No persistent disk | Data lost on restart (that's why we use GitHub) |

---

## Complete Request Lifecycle

### 1. Pushing a Document (Claude → Server)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Claude writes markdown file locally                               │
│                                                                      │
│ 2. Skill executes Python one-liner:                                  │
│    urllib.request.Request → POST /api/documents                      │
│                                                                      │
│ 3. FastAPI receives request:                                         │
│    - Pydantic validates CreateDocumentRequest                        │
│    - DocumentStore.create() generates ID, stores in dict             │
│    - Returns JSON with viewer URL                                    │
│                                                                      │
│ 4. Claude outputs: "View at: https://...onrender.com/doc/abc123"     │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. Viewing a Document (Browser → Server)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. User opens URL in browser                                         │
│                                                                      │
│ 2. FastAPI routes to pages.document_page():                          │
│    - Fetches document from store                                     │
│    - Renders doc.html template with Jinja2                           │
│    - Returns HTML                                                    │
│                                                                      │
│ 3. Browser receives HTML:                                            │
│    - Loads marked.js and highlight.js from CDN                       │
│    - JavaScript parses markdown → HTML                               │
│    - Syntax highlighting applied to code blocks                      │
│                                                                      │
│ 4. User sees beautifully rendered document                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 3. Dashboard Auto-Refresh (HTMX Loop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Browser loads index.html                                          │
│                                                                      │
│ 2. HTMX sees: hx-trigger="load, every 30s"                          │
│    - Immediately fetches /partials/doc-list                          │
│                                                                      │
│ 3. Server returns HTML fragment (just the list, not full page)       │
│                                                                      │
│ 4. HTMX replaces #document-list innerHTML                            │
│                                                                      │
│ 5. Every 30 seconds: repeat steps 2-4                                │
│    (New documents appear automatically!)                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 4. Completing a Document (Commit to GitHub)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. User/Claude calls POST /api/documents/{id}/complete               │
│                                                                      │
│ 2. Server marks document as "complete"                               │
│                                                                      │
│ 3. git_service.save_and_commit():                                    │
│    - Generates file path: "project/2026-01-04-title.md"              │
│    - Creates YAML front matter + content                             │
│    - Calls github_service.commit_to_github()                         │
│                                                                      │
│ 4. GitHub API:                                                       │
│    - GET to check if file exists                                     │
│    - PUT to create/update file (base64 encoded)                      │
│    - Returns commit SHA                                              │
│                                                                      │
│ 5. Response includes GitHub URL to the committed file                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Summary Table

| Component | Technology | Purpose |
|-----------|------------|---------|
| Web Framework | FastAPI | HTTP routing, validation, async |
| Data Validation | Pydantic | Type-safe request/response models |
| Storage | Python dict | In-memory document storage |
| Templating | Jinja2 | Server-side HTML rendering |
| Interactivity | HTMX | AJAX without JavaScript |
| Markdown | marked.js | Client-side markdown → HTML |
| Syntax | highlight.js | Code block coloring |
| Persistence | GitHub API | Permanent storage in docs repo |
| Deployment | Render | Cloud hosting with auto-deploy |
| Integration | Claude Skill | Portable push command |

---

---

## Update: Upsert Support

Documents now support **updates**! When you push the same file again:
- The `path` field (`folder/filename`) acts as a unique key
- If a document with that path exists, it gets updated
- The URL stays the same - your iPad auto-refreshes every 30s!

### The Full Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Claude writes plan.md                                               │
│                        │                                                │
│                        ▼                                                │
│  2. Push to viewer  ──────▶  iPad shows doc/abc123                      │
│                        │                                                │
│                        ▼                                                │
│  3. User reads, requests changes                                        │
│                        │                                                │
│                        ▼                                                │
│  4. Claude edits plan.md                                                │
│                        │                                                │
│                        ▼                                                │
│  5. Push again  ──────────▶  SAME doc/abc123 updates (iPad refreshes!)  │
│                        │                                                │
│                        ▼                                                │
│  6. User approves                                                       │
│                        │                                                │
│                        ▼                                                │
│  7. Complete  ────────────▶  Committed to GitHub docs repo              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Upsert Implementation

```python
# In document_store.py
def find_by_path(self, path: str) -> Optional[Document]:
    for doc in self._documents.values():
        if doc.metadata.path == path:
            return doc
    return None

# In documents.py route
existing_doc = store.find_by_path(body.metadata.path)
if existing_doc:
    doc = store.update(existing_doc.id, body.title, body.content)
else:
    doc = store.create(body)
```

*Document pushed to Another Set of Eyes viewer for reading on iPad.*
