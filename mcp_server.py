#!/usr/bin/env python3
"""
Another Set of Eyes - MCP Server

Allows Claude to push documents to the viewer via MCP tools.
"""
import os
import httpx
from fastmcp import FastMCP
from typing import Optional

# API URL - defaults to production, can override with env var
API_URL = os.getenv("ASOE_API_URL", "https://another-set-of-eyes.onrender.com/api")

mcp = FastMCP(name="another-set-of-eyes")


@mcp.tool
async def create_document(
    title: str,
    content: str,
    path: Optional[str] = None,
    source: str = "claude",
    tags: Optional[list[str]] = None
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
        Document info with id, url, and status
    """
    async with httpx.AsyncClient() as client:
        payload = {
            "title": title,
            "content": content,
            "metadata": {
                "source": source,
                "path": path,
                "tags": tags or []
            }
        }
        r = await client.post(f"{API_URL}/documents", json=payload)
        return r.json()


@mcp.tool
async def list_documents(status: Optional[str] = None) -> list:
    """
    List all documents in Another Set of Eyes.

    Args:
        status: Filter by status - "active" or "complete" (optional)

    Returns:
        List of document summaries with id, title, status
    """
    async with httpx.AsyncClient() as client:
        params = {"status": status} if status else {}
        r = await client.get(f"{API_URL}/documents", params=params)
        return r.json()["documents"]


@mcp.tool
async def get_document(doc_id: str) -> dict:
    """
    Get a document by ID.

    Args:
        doc_id: Document ID

    Returns:
        Full document with content, metadata, timestamps
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{API_URL}/documents/{doc_id}")
        if r.status_code == 404:
            return {"error": "Document not found"}
        return r.json()


@mcp.tool
async def complete_document(
    doc_id: str,
    commit_message: Optional[str] = None
) -> dict:
    """
    Mark document as complete and commit to GitHub.

    Args:
        doc_id: Document ID
        commit_message: Custom git commit message (optional)

    Returns:
        Completion status with git commit info (sha, path, url)
    """
    async with httpx.AsyncClient() as client:
        payload = {"commit_message": commit_message} if commit_message else {}
        r = await client.post(
            f"{API_URL}/documents/{doc_id}/complete",
            json=payload if payload else None
        )
        if r.status_code == 404:
            return {"error": "Document not found"}
        return r.json()


@mcp.tool
async def delete_document(doc_id: str) -> dict:
    """
    Delete a document.

    Args:
        doc_id: Document ID

    Returns:
        Deletion status
    """
    async with httpx.AsyncClient() as client:
        r = await client.delete(f"{API_URL}/documents/{doc_id}")
        if r.status_code == 404:
            return {"error": "Document not found", "deleted": False}
        return {"deleted": True, "id": doc_id}


if __name__ == "__main__":
    mcp.run()
