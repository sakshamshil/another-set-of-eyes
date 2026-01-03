import base64
import httpx
from typing import Optional

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

    if not settings.github_token:
        return {
            "committed": False,
            "error": "GITHUB_TOKEN not configured"
        }

    url = f"https://api.github.com/repos/{settings.github_repo}/contents/{file_path}"

    headers = {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    async with httpx.AsyncClient() as client:
        # Check if file already exists (for updates)
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
            error_data = response.json()
            return {
                "committed": False,
                "error": error_data.get("message", f"HTTP {response.status_code}")
            }
