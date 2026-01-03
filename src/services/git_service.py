import os
import subprocess
import re
from pathlib import Path
from typing import Optional

from src.models import Document

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

    return f"""---
title: "{doc.title}"
created: {doc.created_at.isoformat()}Z
source: {doc.metadata.source or 'unknown'}
tags:
{tags_yaml}
---

"""


def save_and_commit(doc: Document, commit_message: Optional[str] = None) -> dict:
    """
    Save document to file and commit to git.

    Returns dict with commit info or error.
    In production, git operations are skipped (Phase 4.5 will add GitHub API).
    """
    # Skip git operations in production
    if os.getenv("ENVIRONMENT") == "production":
        return {
            "committed": False,
            "message": "Git disabled in production (Phase 4.5 pending)"
        }

    # Ensure documents directory exists
    DOCUMENTS_DIR.mkdir(exist_ok=True)

    # Generate filename
    date_str = doc.created_at.strftime("%Y-%m-%d")
    slug = slugify(doc.title)
    filename = f"{date_str}-{slug}.md"
    filepath = DOCUMENTS_DIR / filename

    # Write file with front matter
    content = generate_front_matter(doc) + doc.content
    filepath.write_text(content, encoding="utf-8")

    # Git operations
    try:
        message = commit_message or f"docs: Add {doc.title}"

        # Run git commands in documents directory
        subprocess.run(
            ["git", "add", filename],
            cwd=DOCUMENTS_DIR,
            check=True,
            capture_output=True
        )

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
            "path": f"documents/{filename}",
            "sha": sha
        }

    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode() if e.stderr else str(e)
        return {
            "committed": False,
            "error": error_msg
        }
