# Phase 2: Frontend Implementation Plan (HTMX + Jinja2)

> **Goal:** Build a working web UI using HTMX and server-side templates.

---

## Overview

| Item | Details |
|------|---------|
| **Scope** | Dashboard + Document viewer with HTMX |
| **Approach** | Server-side rendering with Jinja2 templates |
| **HTMX** | Loaded via CDN, no build step |
| **Files to Create** | 6 files |
| **Testing** | Playwright browser tests |

---

## What is HTMX?

HTMX lets you add dynamic behavior using HTML attributes instead of JavaScript:

```html
<!-- This button fetches /api/documents and replaces #doc-list -->
<button hx-get="/documents" hx-target="#doc-list" hx-swap="innerHTML">
  Refresh
</button>

<div id="doc-list">
  <!-- Content gets swapped here -->
</div>
```

Key attributes:
- `hx-get`, `hx-post`, `hx-delete` - HTTP methods
- `hx-target` - Where to put the response
- `hx-swap` - How to swap (innerHTML, outerHTML, beforeend, etc.)
- `hx-trigger` - When to trigger (click, load, every 30s, etc.)

---

## Architecture Change

### Before (Phase 1)
```
Browser → GET /api/documents → JSON response
Browser → JavaScript parses JSON → Renders HTML
```

### After (Phase 2)
```
Browser → GET /documents (HTMX) → HTML fragment response
Browser → HTMX swaps HTML into page → Done!
```

**Key insight:** Server returns ready-to-display HTML. No client-side parsing.

---

## File Structure

```
md-mcp/
├── src/
│   ├── main.py              # Add Jinja2 setup
│   ├── routes/
│   │   ├── documents.py     # Keep JSON API
│   │   └── pages.py         # NEW: HTML page routes
│   └── templates/           # NEW: Jinja2 templates
│       ├── base.html        # Base layout
│       ├── index.html       # Dashboard page
│       ├── doc.html         # Document viewer page
│       └── partials/        # HTMX fragments
│           ├── doc_list.html
│           └── doc_content.html
├── static/
│   └── css/
│       └── style.css        # GitHub-style theme
└── requirements.txt         # Add jinja2
```

---

## Step-by-Step Implementation

### Step 1: Add Jinja2 Dependency

Update `requirements.txt`:
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
jinja2==3.1.3
```

---

### Step 2: Create Base Template

`src/templates/base.html` - Shared layout for all pages:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% block title %}Document Viewer{% endblock %}</title>

  <!-- HTMX -->
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>

  <!-- Styles -->
  <link rel="stylesheet" href="/static/css/style.css">

  {% block head %}{% endblock %}
</head>
<body>
  {% block content %}{% endblock %}
</body>
</html>
```

---

### Step 3: Create Dashboard Page

`src/templates/index.html`:

```html
{% extends "base.html" %}

{% block title %}Documents{% endblock %}

{% block content %}
<div class="container">
  <header>
    <h1>Documents</h1>
    <button
      class="btn"
      hx-get="/partials/doc-list"
      hx-target="#document-list"
      hx-swap="innerHTML"
    >
      Refresh
    </button>
  </header>

  <main
    id="document-list"
    hx-get="/partials/doc-list"
    hx-trigger="load, every 30s"
    hx-swap="innerHTML"
  >
    <p class="loading">Loading documents...</p>
  </main>
</div>
{% endblock %}
```

**How it works:**
1. On page load (`hx-trigger="load"`), HTMX fetches `/partials/doc-list`
2. Response HTML replaces contents of `#document-list`
3. Auto-refreshes every 30 seconds
4. Refresh button manually triggers the same fetch

---

### Step 4: Create Document List Partial

`src/templates/partials/doc_list.html`:

```html
{% if documents %}
  {% for doc in documents %}
  <a href="/doc/{{ doc.id }}" class="doc-card">
    <div class="doc-card-header">
      <span class="status-indicator status-{{ doc.status }}"></span>
      <h2>{{ doc.title }}</h2>
    </div>
    <div class="doc-card-meta">
      <span class="time">{{ doc.updated_at | timeago }}</span>
      <span class="status">{{ doc.status }}</span>
    </div>
  </a>
  {% endfor %}
{% else %}
  <p class="empty-state">
    No documents yet. Waiting for Claude to push content...
  </p>
{% endif %}
```

---

### Step 5: Create Document Viewer Page

`src/templates/doc.html`:

```html
{% extends "base.html" %}

{% block title %}{{ doc.title }}{% endblock %}

{% block head %}
<!-- Syntax highlighting -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

<!-- Markdown rendering -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
{% endblock %}

{% block content %}
<div class="container doc-view">
  <header>
    <a href="/" class="back-link">&larr; Back</a>
    <h1>{{ doc.title }}</h1>
    <span class="status-badge status-{{ doc.status }}">{{ doc.status }}</span>
  </header>

  <article id="doc-content" class="markdown-body">
    <!-- Content rendered by marked.js -->
  </article>
</div>

<script>
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

  // Render markdown content
  const content = {{ doc.content | tojson }};
  document.getElementById('doc-content').innerHTML = marked.parse(content);
</script>
{% endblock %}
```

**Note:** We still use marked.js for markdown rendering. HTMX handles the page navigation, but markdown parsing happens client-side (it's just a few lines).

---

### Step 6: Create Page Routes

`src/routes/pages.py`:

```python
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from datetime import datetime

from src.services.document_store import store

router = APIRouter()
templates = Jinja2Templates(directory="src/templates")


# Custom filter for relative time
def timeago(dt: datetime) -> str:
    now = datetime.utcnow()
    diff = now - dt
    seconds = diff.total_seconds()

    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    elif seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    else:
        return f"{int(seconds // 86400)}d ago"


# Register filter
templates.env.filters["timeago"] = timeago


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Render dashboard page."""
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/doc/{doc_id}", response_class=HTMLResponse)
async def document_page(request: Request, doc_id: str):
    """Render document viewer page."""
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return templates.TemplateResponse("doc.html", {
        "request": request,
        "doc": doc,
    })


@router.get("/partials/doc-list", response_class=HTMLResponse)
async def document_list_partial(request: Request):
    """Return document list HTML fragment for HTMX."""
    documents = store.list()
    return templates.TemplateResponse("partials/doc_list.html", {
        "request": request,
        "documents": documents,
    })
```

---

### Step 7: Update main.py

Add Jinja2 templates and page routes:

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from src.routes import documents, pages

app = FastAPI(title="Document Viewer")

# API routes (JSON)
app.include_router(documents.router, prefix="/api")

# Page routes (HTML)
app.include_router(pages.router)

# Static files
static_path = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

---

### Step 8: Create CSS Stylesheet

`static/css/style.css` - Same GitHub-style theme from spec.md (already written in spec).

---

## HTMX Interactions Summary

| User Action | HTMX Attribute | Server Endpoint | Response |
|-------------|----------------|-----------------|----------|
| Page loads | `hx-trigger="load"` | `GET /partials/doc-list` | HTML fragment |
| Click Refresh | `hx-get` | `GET /partials/doc-list` | HTML fragment |
| Auto-refresh | `hx-trigger="every 30s"` | `GET /partials/doc-list` | HTML fragment |
| Click document | Normal `<a href>` | `GET /doc/{id}` | Full page |
| Click Back | Normal `<a href>` | `GET /` | Full page |

---

## Testing Plan

### Manual Testing

1. Start server: `uvicorn src.main:app --reload`
2. Open browser to `http://localhost:8000`
3. Verify dashboard loads with "No documents" message
4. Create a document via curl:
   ```bash
   curl -X POST http://localhost:8000/api/documents \
     -H "Content-Type: application/json" \
     -d '{"title": "Test", "content": "# Hello\n\nWorld"}'
   ```
5. Click Refresh or wait 30s - document appears
6. Click document - viewer opens with rendered markdown
7. Click Back - returns to dashboard

### Automated Testing (Playwright)

```python
# test_phase2.py
from playwright.sync_api import sync_playwright
import subprocess
import time

def test_frontend():
    # Start server
    server = subprocess.Popen(
        ["uvicorn", "src.main:app", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()

            # Test 1: Dashboard loads
            page.goto("http://localhost:8000")
            assert "Documents" in page.title()

            # Test 2: Empty state shown
            assert page.locator(".empty-state").is_visible()

            # Test 3: Create document via API
            page.evaluate("""
                fetch('/api/documents', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        title: 'Test Doc',
                        content: '# Hello\\n\\nThis is a test.'
                    })
                })
            """)

            # Test 4: Click refresh, document appears
            page.click("button:has-text('Refresh')")
            page.wait_for_selector(".doc-card")
            assert page.locator(".doc-card").count() == 1

            # Test 5: Click document, viewer opens
            page.click(".doc-card")
            page.wait_for_selector(".markdown-body")
            assert "Hello" in page.locator(".markdown-body").inner_text()

            # Test 6: Back button works
            page.click(".back-link")
            page.wait_for_selector(".doc-card")

            browser.close()
            print("All tests passed!")

    finally:
        server.terminate()


if __name__ == "__main__":
    test_frontend()
```

---

## Success Criteria

Phase 2 is complete when:

- [ ] Dashboard page loads and shows empty state
- [ ] HTMX auto-refreshes document list every 30s
- [ ] Refresh button manually triggers update
- [ ] Document cards show title, status, time ago
- [ ] Clicking a card opens document viewer
- [ ] Markdown renders with syntax highlighting
- [ ] Back button returns to dashboard
- [ ] Dark/light mode follows system preference
- [ ] Works on mobile/iPad

---

## Files Created in This Phase

| File | Purpose |
|------|---------|
| `src/routes/pages.py` | HTML page routes |
| `src/templates/base.html` | Base layout |
| `src/templates/index.html` | Dashboard page |
| `src/templates/doc.html` | Document viewer |
| `src/templates/partials/doc_list.html` | Document list fragment |
| `static/css/style.css` | GitHub-style theme |

---

## Why HTMX is Easier

| Vanilla JS | HTMX |
|------------|------|
| Write fetch() calls | Add `hx-get` attribute |
| Parse JSON response | Server returns HTML |
| Build HTML strings | Use Jinja2 templates |
| Handle DOM updates | HTMX swaps automatically |
| Write event handlers | Use `hx-trigger` |
| ~50 lines of JS | ~0 lines of JS |

The only JavaScript we write is for markdown rendering (which HTMX can't do).

---

## Next Phase

After Phase 2 is complete, proceed to **Phase 3: Git Integration** which adds:
- `src/services/git_service.py`
- Auto-commit on document complete
- Front matter generation
