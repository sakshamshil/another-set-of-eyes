# Phase 5: MCP Wrapper

> **Goal:** Create an MCP server that wraps the document API for Claude integration.

---

## Overview

| Item | Details |
|------|---------|
| **Scope** | MCP server exposing document tools |
| **Files to Create** | `mcp_server.py` |
| **Dependencies** | `mcp` package |

---

## What is MCP?

Model Context Protocol (MCP) allows AI assistants to interact with external tools. Instead of Claude calling HTTP APIs directly, it uses MCP tools which are:
- Discoverable (Claude sees available tools)
- Type-safe (defined schemas)
- Integrated (native tool calling)

---

## MCP Tools

### 1. `create_document`
Create a new document in the viewer.

```python
@server.tool()
async def create_document(
    title: str,
    content: str,
    path: str = "",
    source: str = "claude",
    tags: list[str] = []
) -> dict:
    """Create a document and return its URL."""
```

### 2. `list_documents`
List all documents.

```python
@server.tool()
async def list_documents(status: str = None) -> list[dict]:
    """List documents, optionally filtered by status."""
```

### 3. `get_document`
Get a document by ID.

```python
@server.tool()
async def get_document(doc_id: str) -> dict:
    """Get full document content by ID."""
```

### 4. `complete_document`
Mark document complete and commit to GitHub.

```python
@server.tool()
async def complete_document(
    doc_id: str,
    commit_message: str = None
) -> dict:
    """Complete document and commit to GitHub."""
```

### 5. `delete_document`
Delete a document.

```python
@server.tool()
async def delete_document(doc_id: str) -> bool:
    """Delete a document by ID."""
```

---

## Implementation

### mcp_server.py

```python
import asyncio
import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server

# Config
API_URL = "https://another-set-of-eyes.onrender.com/api"

server = Server("another-set-of-eyes")


@server.tool()
async def create_document(
    title: str,
    content: str,
    path: str = "",
    source: str = "claude",
    tags: list[str] = []
) -> dict:
    """
    Create a new document in Another Set of Eyes.

    Args:
        title: Document title
        content: Markdown content
        path: Folder path like "project/specs" (optional)
        source: Source identifier (default: claude)
        tags: List of tags (optional)

    Returns:
        Document info with id and url
    """
    async with httpx.AsyncClient() as client:
        payload = {
            "title": title,
            "content": content,
            "metadata": {
                "source": source,
                "path": path if path else None,
                "tags": tags
            }
        }
        r = await client.post(f"{API_URL}/documents", json=payload)
        return r.json()


@server.tool()
async def list_documents(status: str = None) -> list:
    """
    List all documents in Another Set of Eyes.

    Args:
        status: Filter by status ("active" or "complete")

    Returns:
        List of document summaries
    """
    async with httpx.AsyncClient() as client:
        params = {"status": status} if status else {}
        r = await client.get(f"{API_URL}/documents", params=params)
        return r.json()["documents"]


@server.tool()
async def get_document(doc_id: str) -> dict:
    """
    Get a document by ID.

    Args:
        doc_id: Document ID

    Returns:
        Full document with content
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{API_URL}/documents/{doc_id}")
        if r.status_code == 404:
            return {"error": "Document not found"}
        return r.json()


@server.tool()
async def complete_document(doc_id: str, commit_message: str = None) -> dict:
    """
    Mark document as complete and commit to GitHub.

    Args:
        doc_id: Document ID
        commit_message: Custom commit message (optional)

    Returns:
        Completion status with git info
    """
    async with httpx.AsyncClient() as client:
        payload = {"commit_message": commit_message} if commit_message else {}
        r = await client.post(f"{API_URL}/documents/{doc_id}/complete", json=payload)
        if r.status_code == 404:
            return {"error": "Document not found"}
        return r.json()


@server.tool()
async def delete_document(doc_id: str) -> dict:
    """
    Delete a document.

    Args:
        doc_id: Document ID

    Returns:
        Success status
    """
    async with httpx.AsyncClient() as client:
        r = await client.delete(f"{API_URL}/documents/{doc_id}")
        if r.status_code == 404:
            return {"error": "Document not found", "deleted": False}
        return {"deleted": True}


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream)


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Claude Desktop Config

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "another-set-of-eyes": {
      "command": "python",
      "args": ["/path/to/mcp_server.py"]
    }
  }
}
```

---

## Usage in Claude

Once configured, Claude can use the tools naturally:

```
Claude, create a document titled "API Design" with the content I'm about to share,
and put it in the "my-project/docs" folder.
```

Claude will call:
```python
create_document(
    title="API Design",
    content="...",
    path="my-project/docs"
)
```

---

## Success Criteria

- [ ] MCP server runs and connects to Claude
- [ ] All 5 tools work correctly
- [ ] Documents appear in web UI
- [ ] Completed docs commit to GitHub
