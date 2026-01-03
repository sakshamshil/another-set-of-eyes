import subprocess
import re
from pathlib import Path
from typing import Optional

from src.models import Document
from src.config import get_settings
from src.services.github_service import commit_to_github

DOCUMENTS_DIR = Path(__file__).parent.parent.parent / "documents"


def slugify(title: str) -> str:
    """Convert title to URL-safe slug."""
    slug = title.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')[:50]


def generate_front_matter(doc: Document) -> str:
    """Generate YAML front matter for document."""
    tags_yaml = "\n".join(f"  - {tag}" for tag in doc.metadata.tags)
    if not tags_yaml:
        tags_yaml = "  []"

    path_line = f'path: "{doc.metadata.path}"' if doc.metadata.path else ""

    return f"""---
title: "{doc.title}"
created: {doc.created_at.isoformat()}Z
source: {doc.metadata.source or 'unknown'}
{path_line}
tags:
{tags_yaml}
---

""".replace("\n\n\n", "\n\n")  # Clean up empty path line


def generate_file_path(doc: Document) -> str:
    """Generate full file path including folder structure."""
    date_str = doc.created_at.strftime("%Y-%m-%d")
    slug = slugify(doc.title)
    filename = f"{date_str}-{slug}.md"

    if doc.metadata.path:
        return f"{doc.metadata.path}/{filename}"
    return filename


async def save_and_commit(doc: Document, commit_message: Optional[str] = None) -> dict:
    """
    Save document and commit to git/GitHub.

    In production: Uses GitHub API
    In development: Uses local git subprocess
    """
    settings = get_settings()
    file_path = generate_file_path(doc)
    content = generate_front_matter(doc) + doc.content
    message = commit_message or f"docs: Add {doc.title}"

    if settings.is_production:
        # Use GitHub API in production
        return await commit_to_github(file_path, content, message)
    else:
        # Use local git in development
        return _local_git_commit(doc, file_path, content, message)


def _local_git_commit(doc: Document, file_path: str, content: str, message: str) -> dict:
    """Commit using local git subprocess (development only)."""
    # Ensure documents directory exists
    DOCUMENTS_DIR.mkdir(exist_ok=True)

    # Handle nested folders
    full_path = DOCUMENTS_DIR / file_path
    full_path.parent.mkdir(parents=True, exist_ok=True)

    # Write file
    full_path.write_text(content, encoding="utf-8")

    try:
        # Git add the file
        subprocess.run(
            ["git", "add", file_path],
            cwd=DOCUMENTS_DIR,
            check=True,
            capture_output=True
        )

        # Git commit
        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=DOCUMENTS_DIR,
            check=True,
            capture_output=True
        )

        # Push to remote
        subprocess.run(
            ["git", "push"],
            cwd=DOCUMENTS_DIR,
            check=True,
            capture_output=True
        )

        # Get commit SHA
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=DOCUMENTS_DIR,
            capture_output=True,
            text=True,
            check=True
        )
        sha = result.stdout.strip()[:7]

        return {
            "committed": True,
            "path": file_path,
            "sha": sha
        }

    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode() if e.stderr else str(e)
        return {
            "committed": False,
            "error": error_msg
        }
