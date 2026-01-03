# Another Set of Eyes

A document viewer for AI-generated content. Push markdown documents from Claude to a beautiful web interface for reading on iPad or secondary displays.

## Live Demo

**Viewer:** https://another-set-of-eyes.onrender.com

## Features

- **Push documents** via REST API
- **Beautiful rendering** with GitHub-flavored markdown
- **Syntax highlighting** for code blocks
- **Auto-refresh** dashboard with HTMX
- **GitHub persistence** - documents auto-commit to a docs repo
- **Folder organization** - organize by project/category

## Quick Start

### Push a Document

```bash
curl -X POST https://another-set-of-eyes.onrender.com/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Document",
    "content": "# Hello World\n\nThis is my document.",
    "metadata": {
      "path": "my-project/docs",
      "source": "claude-code"
    }
  }'
```

### View It

Open the returned URL in your browser or on your iPad.

### Complete & Commit

```bash
curl -X POST https://another-set-of-eyes.onrender.com/api/documents/{id}/complete
```

This commits the document to GitHub for permanent storage.

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents` | POST | Create a document |
| `/api/documents` | GET | List all documents |
| `/api/documents/{id}` | GET | Get a document |
| `/api/documents/{id}/complete` | POST | Complete & commit to GitHub |
| `/api/documents/{id}` | DELETE | Delete a document |
| `/health` | GET | Health check |

## Claude Code Skill

To use with Claude Code, copy the skill to your skills directory:

```bash
mkdir -p ~/.claude/skills/push-doc
cp skill/SKILL.md ~/.claude/skills/push-doc/
```

Then restart Claude Code. Claude will automatically push long documents to the viewer.

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn src.main:app --reload

# View at http://localhost:8000
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ENVIRONMENT` | `development` or `production` | Yes |
| `GITHUB_TOKEN` | GitHub PAT for commits | Production |
| `GITHUB_REPO` | Target repo (e.g., `user/docs`) | Production |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│   FastAPI       │────▶│   GitHub API    │
│  (push docs)    │     │   (Render)      │     │   (persistence) │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Web Viewer    │
                        │   (iPad/Phone)  │
                        └─────────────────┘
```

## License

MIT
