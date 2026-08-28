# Another Set of Eyes

Push plans, docs and HTML pages from your AI coding agent to another screen instantly.

## What it does

Your agent writes a 500-line implementation plan. Instead of it scrolling off the terminal or getting lost, it pushes it to your ASOE — appears as a live tab in your browser instantly via SSE. No refresh needed.

## Install the agent skill

Run this once in your terminal:

```bash
npx asoe-install
```

Prompts for your ASOE URL and passphrase, auto-detects installed agents (Claude Code, Codex, OpenCode, Cursor, Windsurf), and installs the skill for each.

The skill auto-pushes any markdown file over 50 lines, and any `.html` file. Same file path = updates the same doc (idempotent).

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
| GET | `/r/{render_key}` | Render an HTML doc — no passphrase, see below |

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

## HTML documents

Set `metadata.kind` to `"html"` and the doc renders as a real page instead of as markdown.
The push response then also returns a `render_url`.

```bash
curl -X POST https://asoe.sakshamshil.xyz/api/documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-passphrase" \
  -d '{
    "title": "Q3 Dashboard",
    "content": "<!doctype html>...",
    "metadata": { "source": "agent", "path": "my-project/dash.html", "kind": "html" }
  }'
```

```json
{ "kind": "html", "url": ".../doc/abc123", "render_url": ".../r/6f1a9cb6..." }
```

The HTML doc sits in the same list, under the same passphrase, as everything else.
Only the way it renders is different.

### Why the render URL has no passphrase

An HTML doc keeps its own scripts, so it cannot go through DOMPurify the way markdown
does. If it ran on the app origin, a script inside it could read the passphrase out of
`localStorage` and then read the whole account.

So the app never runs it on the app origin. `/r/{render_key}` returns the page with
`Content-Security-Policy: sandbox allow-scripts ...`, which puts it in an opaque origin
even on a direct visit. The app frames that URL with a matching `sandbox` attribute.
Neither one ever includes `allow-same-origin` — adding it defeats the whole mechanism.

A frame cannot send an `Authorization` header, so the URL has to carry a key. The key is
random and per-doc, never the passphrase, because a sandboxed page can read its own URL.

Two consequences:

- The `render_url` opens on any device with no sign-in. Treat it as unlisted, not secret.
- The page may still load Tailwind, Chart.js, fonts and other CDN assets. The sandbox
  restricts the origin, not the network.

## Run locally

```bash
cp .env.example .env   # fill in DATABASE_URL and PHRASE_SECRET
psql "$DATABASE_URL" -f migrations/001_add_html_docs.sql
uvicorn src.main:app --reload --port 8080
```

## Migrations

`Base.metadata.create_all` creates missing tables but never alters an existing one.
Apply the SQL in `migrations/` by hand before you deploy a schema change.

## Stack

- FastAPI + uvicorn
- PostgreSQL (Neon) via SQLAlchemy async
- SSE for live updates
- HTMX + vanilla JS frontend
- Docker + nginx on VPS
