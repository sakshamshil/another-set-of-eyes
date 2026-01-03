---
name: push-doc
description: Push markdown documents to Another Set of Eyes viewer for reading on iPad/secondary display. Use when writing plans, documentation, specs, or any long-form markdown content that the user might want to read comfortably.
allowed-tools: Bash
---

# Push Document to Another Set of Eyes

Push markdown content to a beautiful web viewer for reading on iPad or secondary displays.

## API Endpoint

```
https://another-set-of-eyes.onrender.com/api
```

## How to Push a Document

### Step 1: Create the document

```bash
curl -s -X POST https://another-set-of-eyes.onrender.com/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Document Title",
    "content": "# Markdown content here",
    "metadata": {
      "source": "claude-code",
      "path": "project-name/folder",
      "tags": ["tag1", "tag2"]
    }
  }'
```

**Response:**
```json
{
  "id": "abc123",
  "url": "https://another-set-of-eyes.onrender.com/doc/abc123"
}
```

### Step 2: Tell the user the URL

After creating, tell the user:
> "Document pushed! View it at: https://another-set-of-eyes.onrender.com/doc/{id}"

### Step 3 (Optional): Complete and commit to GitHub

If the document is finalized:
```bash
curl -s -X POST https://another-set-of-eyes.onrender.com/api/documents/{id}/complete
```

This commits the document to GitHub for permanent storage.

## When to Use This Skill

Use this skill proactively when you write:
- Implementation plans
- Architecture documents
- Technical specifications
- Long documentation
- Any markdown content over ~100 lines

## Example Workflow

1. User asks: "Write an implementation plan for feature X"
2. Write the plan content
3. Push to Another Set of Eyes using the API
4. Tell user: "I've pushed the plan to your viewer. Read it at: [URL]"
5. If user approves, complete the document to commit to GitHub

## Path Convention

Use meaningful paths to organize documents:
- `project-name/plans` - Implementation plans
- `project-name/docs` - Documentation
- `project-name/specs` - Specifications
- `project-name/architecture` - Architecture docs

## Important Notes

- Content must be valid JSON (escape special characters)
- For multiline content, use Python to handle escaping properly
- The viewer renders GitHub-flavored markdown with syntax highlighting
