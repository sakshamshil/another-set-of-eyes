# Another Set of Eyes

Push plans from your AI coding assistant to another screen.

## Why

Your Claude Code writes a 500-line implementation plan. You want to read it on another screen from wherever. Or it just runs off and you lose the plan completely. This solves that.

## Install (Claude Code)

```bash
/install sakshamshil/another-set-of-eyes
```

This adds the skill that auto-pushes plans after Claude writes them.

## How It Works

Push a doc → it appears instantly as a new tab (SSE live updates). No refresh needed.

## Use (Manual)

```bash
curl -X POST https://another-set-of-eyes.koyeb.app/api/documents \
  -H "Content-Type: application/json" \
  -d '{"title": "Auth Plan", "content": "...", "metadata": {"source": "claude"}}'
```

→ Returns a URL. Open it anywhere.

## Workflow

```
Claude writes plan → auto-pushes → appears as tab instantly → you read → approve → commits to GitHub
```

## Run Locally

```bash
uvicorn src.main:app --reload --port 8080
```

## API

| Method | Endpoint | What |
|--------|----------|------|
| POST | `/api/documents` | Push doc |
| GET | `/api/documents` | List docs |
| DELETE | `/api/documents/{id}` | Delete |
| POST | `/api/documents/{id}/complete` | Commit to GitHub |
