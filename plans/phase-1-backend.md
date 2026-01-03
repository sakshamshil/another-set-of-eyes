# Phase 1: Backend Implementation Plan

> **Goal:** Build a working FastAPI backend with all API endpoints, testable via curl.

---

## Overview

| Item | Details |
|------|---------|
| **Scope** | Backend API only (no frontend yet) |
| **Files to Create** | 8 files |
| **Testing** | curl commands + automated API tests |
| **Deliverable** | Server that accepts document CRUD operations |

---

## Step-by-Step Implementation

### Step 1: Create Project Structure

Create the directory structure and empty `__init__.py` files.

```
md-mcp/
├── src/
│   ├── __init__.py
│   ├── main.py
│   ├── models.py
│   ├── routes/
│   │   ├── __init__.py
│   │   └── documents.py
│   └── services/
│       ├── __init__.py
│       └── document_store.py
├── static/               # Empty for now, needed for main.py
│   └── .gitkeep
├── documents/            # For git storage
│   └── .gitkeep
└── requirements.txt
```

**Files to create:**
1. `src/__init__.py` (empty)
2. `src/routes/__init__.py` (empty)
3. `src/services/__init__.py` (empty)
4. `static/.gitkeep` (empty)
5. `documents/.gitkeep` (empty)
6. `requirements.txt`

---

### Step 2: Create requirements.txt

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
```

---

### Step 3: Implement models.py

Create Pydantic models for:
- `DocumentMetadata` - source, tags
- `Document` - full document with content
- `CreateDocumentRequest` - input for POST /api/documents
- `CompleteDocumentRequest` - input for POST /api/documents/{id}/complete
- `DocumentSummary` - lightweight doc info for listing
- `DocumentListResponse` - list endpoint response
- `CreateDocumentResponse` - create endpoint response
- `CompleteDocumentResponse` - complete endpoint response

**Key Implementation Details:**
- Use `Field(default_factory=...)` for mutable defaults
- ID generation: `str(uuid4())[:8]` for short readable IDs
- Timestamps: `datetime.utcnow()`
- Status: Literal type with "active" | "complete"

---

### Step 4: Implement document_store.py

In-memory storage with these methods:
- `create(request) -> Document`
- `get(doc_id) -> Optional[Document]`
- `list(status=None) -> list[Document]`
- `complete(doc_id) -> Optional[Document]`
- `delete(doc_id) -> bool`

**Key Implementation Details:**
- Use a singleton instance: `store = DocumentStore()`
- Store documents in `self._documents: dict[str, Document]`
- Sort by `updated_at` descending in list()
- Update `updated_at` when completing

---

### Step 5: Implement documents.py routes

Create FastAPI router with endpoints:

| Method | Path | Function |
|--------|------|----------|
| POST | `/documents` | `create_document()` |
| GET | `/documents` | `list_documents()` |
| GET | `/documents/{doc_id}` | `get_document()` |
| POST | `/documents/{doc_id}/complete` | `complete_document()` |
| DELETE | `/documents/{doc_id}` | `delete_document()` |

**Key Implementation Details:**
- Router prefix: `/documents`
- Return 201 for create, 204 for delete
- Raise `HTTPException(404)` when document not found
- Build URL from `request.base_url` in create response
- Skip git integration for now (Phase 3)

---

### Step 6: Implement main.py

FastAPI application with:
- Include documents router with `/api` prefix
- Mount static files at `/static`
- Serve `index.html` at `/`
- Serve `doc.html` at `/doc/{doc_id}`

**Key Implementation Details:**
- Static file serving needs the `static/` directory to exist
- HTML routes return `FileResponse`
- For Phase 1, HTML files don't exist yet - routes will 404 (that's OK)

---

## Testing Plan

### Test 1: Server Starts

```bash
# Start server in background
cd /home/saksham/Desktop/projects/md-mcp
uvicorn src.main:app --host 0.0.0.0 --port 8000 &

# Verify it's running
curl -s http://localhost:8000/api/documents | jq
# Expected: {"documents": [], "count": 0}
```

---

### Test 2: Create Document

```bash
# Create a document
curl -X POST http://localhost:8000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Document",
    "content": "# Hello World\n\nThis is a test.",
    "metadata": {"source": "test", "tags": ["testing"]}
  }' | jq

# Expected response:
# {
#   "id": "xxxxxxxx",
#   "title": "Test Document",
#   "status": "active",
#   "url": "http://localhost:8000/doc/xxxxxxxx",
#   "created_at": "2024-01-03T..."
# }
```

---

### Test 3: List Documents

```bash
curl -s http://localhost:8000/api/documents | jq

# Expected: {"documents": [...], "count": 1}
```

---

### Test 4: Get Single Document

```bash
# Replace DOC_ID with actual ID from create response
curl -s http://localhost:8000/api/documents/DOC_ID | jq

# Expected: Full document with content
```

---

### Test 5: Get Non-Existent Document (404)

```bash
curl -s -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:8000/api/documents/nonexistent

# Expected: HTTP Status: 404
```

---

### Test 6: Complete Document

```bash
curl -X POST http://localhost:8000/api/documents/DOC_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"commit_message": "test commit"}' | jq

# Expected: {"id": "...", "status": "complete", "git": null}
# (git is null because git_service not implemented yet)
```

---

### Test 7: Filter by Status

```bash
# List only active documents
curl -s "http://localhost:8000/api/documents?status=active" | jq

# List only complete documents
curl -s "http://localhost:8000/api/documents?status=complete" | jq
```

---

### Test 8: Delete Document

```bash
curl -X DELETE -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:8000/api/documents/DOC_ID

# Expected: HTTP Status: 204

# Verify it's gone
curl -s http://localhost:8000/api/documents | jq
# Expected: {"documents": [], "count": 0}
```

---

### Test 9: Delete Non-Existent (404)

```bash
curl -X DELETE -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:8000/api/documents/nonexistent

# Expected: HTTP Status: 404
```

---

## Automated Test Script

Create a test script that runs all tests:

```bash
#!/bin/bash
# test_phase1.sh

BASE_URL="http://localhost:8000"
PASSED=0
FAILED=0

# Helper function
test_endpoint() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if echo "$actual" | grep -q "$expected"; then
    echo "✓ $name"
    ((PASSED++))
  else
    echo "✗ $name"
    echo "  Expected: $expected"
    echo "  Got: $actual"
    ((FAILED++))
  fi
}

echo "=== Phase 1 API Tests ==="
echo ""

# Test 1: Empty list
RESP=$(curl -s "$BASE_URL/api/documents")
test_endpoint "Empty document list" '"count": 0' "$RESP"

# Test 2: Create document
RESP=$(curl -s -X POST "$BASE_URL/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Doc", "content": "# Test"}')
test_endpoint "Create document" '"status": "active"' "$RESP"

# Extract ID
DOC_ID=$(echo "$RESP" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
echo "  Created document ID: $DOC_ID"

# Test 3: List shows document
RESP=$(curl -s "$BASE_URL/api/documents")
test_endpoint "List shows document" '"count": 1' "$RESP"

# Test 4: Get document
RESP=$(curl -s "$BASE_URL/api/documents/$DOC_ID")
test_endpoint "Get document" '"content": "# Test"' "$RESP"

# Test 5: 404 for missing
RESP=$(curl -s -w "%{http_code}" "$BASE_URL/api/documents/missing")
test_endpoint "404 for missing" "404" "$RESP"

# Test 6: Complete document
RESP=$(curl -s -X POST "$BASE_URL/api/documents/$DOC_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{}')
test_endpoint "Complete document" '"status": "complete"' "$RESP"

# Test 7: Filter by status
RESP=$(curl -s "$BASE_URL/api/documents?status=complete")
test_endpoint "Filter by status" '"count": 1' "$RESP"

# Test 8: Delete document
RESP=$(curl -s -w "%{http_code}" -X DELETE "$BASE_URL/api/documents/$DOC_ID")
test_endpoint "Delete document" "204" "$RESP"

# Test 9: Verify deleted
RESP=$(curl -s "$BASE_URL/api/documents")
test_endpoint "Document deleted" '"count": 0' "$RESP"

echo ""
echo "=== Results: $PASSED passed, $FAILED failed ==="
```

---

## Success Criteria

Phase 1 is complete when:

- [ ] Server starts without errors
- [ ] `POST /api/documents` creates document with ID
- [ ] `GET /api/documents` lists all documents
- [ ] `GET /api/documents/{id}` returns full document
- [ ] `GET /api/documents?status=active` filters correctly
- [ ] `POST /api/documents/{id}/complete` changes status
- [ ] `DELETE /api/documents/{id}` removes document
- [ ] 404 returned for missing documents
- [ ] All automated tests pass

---

## Files Created in This Phase

| File | Purpose |
|------|---------|
| `requirements.txt` | Python dependencies |
| `src/__init__.py` | Package marker |
| `src/main.py` | FastAPI app entry point |
| `src/models.py` | Pydantic data models |
| `src/routes/__init__.py` | Package marker |
| `src/routes/documents.py` | API endpoints |
| `src/services/__init__.py` | Package marker |
| `src/services/document_store.py` | In-memory storage |
| `static/.gitkeep` | Placeholder for static files |
| `documents/.gitkeep` | Placeholder for git storage |
| `test_phase1.sh` | Automated test script |

---

## Next Phase

After Phase 1 is complete and tested, proceed to **Phase 2: Frontend** which adds:
- `static/index.html` (dashboard)
- `static/doc.html` (document viewer)
- `static/css/style.css` (GitHub styling)
- `static/js/app.js` (dashboard logic)
