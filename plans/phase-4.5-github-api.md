# Phase 4.5: GitHub API + Folder Structure

> **Goal:** Replace subprocess git with GitHub API, add folder organization for documents.

---

## Overview

| Item | Details |
|------|---------|
| **Scope** | GitHub API integration + folder paths |
| **Files to Create** | `src/services/github_service.py` |
| **Files to Update** | `src/models.py`, `src/services/git_service.py` |

---

## Features

### 1. GitHub API Integration

Replace subprocess git commands with GitHub REST API:
- Create/update files via API
- Works in production (no local git needed)
- Uses Personal Access Token from env

### 2. Folder Structure Support

Documents organized by project/category:

```
another-set-of-eyes-docs/
├── project-alpha/
│   ├── architecture/
│   │   └── 2026-01-03-system-design.md
│   └── test-plans/
│       └── 2026-01-03-integration-tests.md
├── project-beta/
│   └── specs/
│       └── 2026-01-03-api-spec.md
└── uncategorized/
    └── 2026-01-03-random-note.md
```

---

## API Changes

### CreateDocumentRequest (updated)

```python
class DocumentMetadata(BaseModel):
    source: Optional[str] = None
    tags: list[str] = []
    path: Optional[str] = None  # NEW: folder path like "project-a/specs"
```

### Usage

```bash
# With folder path
curl -X POST /api/documents \
  -d '{
    "title": "API Spec",
    "content": "# API Specification...",
    "metadata": {
      "source": "claude-code",
      "path": "project-alpha/specs",
      "tags": ["api", "docs"]
    }
  }'

# Result: project-alpha/specs/2026-01-03-api-spec.md
```

---

## Implementation

### github_service.py

```python
import httpx
import base64
from src.config import get_settings

async def commit_to_github(
    file_path: str,
    content: str,
    commit_message: str
) -> dict:
    """
    Create or update a file in the docs repo via GitHub API.

    Args:
        file_path: Full path like "project-a/specs/2026-01-03-doc.md"
        content: File content (will be base64 encoded)
        commit_message: Git commit message

    Returns:
        dict with committed status, sha, and url
    """
    settings = get_settings()

    url = f"https://api.github.com/repos/{settings.github_repo}/contents/{file_path}"

    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    # Check if file exists (for updates)
    async with httpx.AsyncClient() as client:
        existing = await client.get(url, headers=headers)

        payload = {
            "message": commit_message,
            "content": base64.b64encode(content.encode()).decode(),
        }

        # If file exists, include sha for update
        if existing.status_code == 200:
            payload["sha"] = existing.json()["sha"]

        response = await client.put(url, headers=headers, json=payload)

        if response.status_code in (200, 201):
            data = response.json()
            return {
                "committed": True,
                "path": file_path,
                "sha": data["commit"]["sha"][:7],
                "url": data["content"]["html_url"]
            }
        else:
            return {
                "committed": False,
                "error": response.json().get("message", "Unknown error")
            }
```

### Update git_service.py

```python
from src.services.github_service import commit_to_github

async def save_and_commit(doc: Document, commit_message: Optional[str] = None) -> dict:
    settings = get_settings()

    # Generate file path
    date_str = doc.created_at.strftime("%Y-%m-%d")
    slug = slugify(doc.title)
    filename = f"{date_str}-{slug}.md"

    # Use metadata.path if provided, otherwise root
    folder = doc.metadata.path or ""
    if folder:
        file_path = f"{folder}/{filename}"
    else:
        file_path = filename

    # Generate content with front matter
    content = generate_front_matter(doc) + doc.content
    message = commit_message or f"docs: Add {doc.title}"

    if settings.is_production:
        # Use GitHub API in production
        return await commit_to_github(file_path, content, message)
    else:
        # Use local git in development
        return _local_git_commit(file_path, content, message)
```

---

## Testing

```bash
# Create document with folder path
curl -X POST http://localhost:8000/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Plan",
    "content": "# Test Plan\n\nThis is a test.",
    "metadata": {
      "path": "my-project/testing"
    }
  }'

# Complete it
curl -X POST http://localhost:8000/api/documents/{id}/complete

# Verify in GitHub
# Should create: my-project/testing/2026-01-03-test-plan.md
```

---

## Success Criteria

- [ ] Documents commit via GitHub API in production
- [ ] Folder paths create proper directory structure
- [ ] Front matter preserved
- [ ] Commit SHA returned in response
- [ ] Works with existing documents (no path = root folder)
