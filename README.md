# Another Set of Eyes

Push plans and docs from your AI coding agent to another screen instantly.

## What it does

Your agent writes a 500-line implementation plan. Instead of it scrolling off the terminal or getting lost, it pushes it to your ASOE — appears as a live tab in your browser instantly via SSE. No refresh needed.

## Install the agent skill

Run this once in your terminal:

```bash
npx asoe-install
```

Prompts for your ASOE URL and passphrase, auto-detects installed agents (Claude Code, Codex, OpenCode, Cursor, Windsurf), and installs the skill for each.

The skill auto-pushes any markdown file over 50 lines. Same file path = updates the same doc (idempotent).

## Auth

No sign-up. Your passphrase is your account — same phrase always returns to the same space. New phrase creates a new space. No recovery if forgotten.

Passphrase is sent as `Authorization: Bearer <phrase>` on every API request.

## API

| Method | Endpoint | What |
|--------|----------|------|
| POST | `/api/auth/token` | Register / verify passphrase |
| POST | `/api/documents` | Push a doc (upserts by `metadata.path`) |
| GET | `/api/documents` | List docs |
| GET | `/api/documents/{id}` | Get a doc with content |
| PUT | `/api/documents/{id}` | Update title + content |
| PATCH | `/api/documents/{id}` | Rename (title only) |
| DELETE | `/api/documents/{id}` | Delete a doc |
| DELETE | `/api/documents` | Clear all docs |
| GET | `/api/documents/stream` | SSE stream (`?token=<phrase>`) |

### Push example

```bash
curl -X POST https://asoe.sakshamshil.xyz/api/documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-passphrase" \
  -d '{
    "title": "Auth Plan",
    "content": "# Auth Plan\n\n...",
    "metadata": { "source": "claude-code", "path": "my-project/plans/auth.md" }
  }'
```

The `metadata.path` field is the idempotent key — pushing the same path twice updates the first doc.

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL and PHRASE_SECRET
uvicorn src.main:app --reload --port 8080
```

## Stack

- FastAPI + uvicorn
- PostgreSQL (Neon) via SQLAlchemy async
- SSE for live updates
- HTMX + vanilla JS frontend
- Docker + nginx on VPS
