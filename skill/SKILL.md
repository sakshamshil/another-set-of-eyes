---
name: push-doc
description: Push markdown files to Another Set of Eyes viewer for reading on iPad/secondary display. Use after writing plans, docs, or specs to a .md file. Pushing the same file again updates the existing document (same URL).
allowed-tools: Bash, Read
---

# Push Document to Another Set of Eyes

Push markdown files to a beautiful web viewer for reading on iPad or secondary displays.

**Key feature**: Pushing the same file again **updates** the existing document - your iPad auto-refreshes!

## Command

After writing a markdown file, push it with this command (uses only Python standard library):

```bash
python3 -c "
import urllib.request, json, re, sys, os
file, folder = sys.argv[1], sys.argv[2]
filename = os.path.basename(file)
content = open(file).read()
title = re.search(r'^# (.+)', content, re.M)
title = title.group(1) if title else filename
path = f'{folder}/{filename}'
data = json.dumps({'title': title, 'content': content, 'metadata': {'source': 'claude-code', 'path': path}}).encode()
req = urllib.request.Request('https://another-set-of-eyes.onrender.com/api/documents', data, {'Content-Type': 'application/json'})
res = json.loads(urllib.request.urlopen(req).read())
print(f\"View at: {res['url']}\")
" FILE FOLDER
```

Replace:
- `FILE` → path to the markdown file
- `FOLDER` → folder in docs repo (e.g., `project/plans`)

## How Updates Work

The `path` field (`folder/filename`) is the unique identifier:

```
First push:  plans/auth.md → creates doc/abc123
Edit file
Second push: plans/auth.md → UPDATES doc/abc123 (same URL!)
```

Your iPad auto-refreshes every 30 seconds via HTMX, so changes appear automatically.

## Example

After writing `plans/auth.md`:

```bash
python3 -c "
import urllib.request, json, re, sys, os
file, folder = sys.argv[1], sys.argv[2]
filename = os.path.basename(file)
content = open(file).read()
title = re.search(r'^# (.+)', content, re.M)
title = title.group(1) if title else filename
path = f'{folder}/{filename}'
data = json.dumps({'title': title, 'content': content, 'metadata': {'source': 'claude-code', 'path': path}}).encode()
req = urllib.request.Request('https://another-set-of-eyes.onrender.com/api/documents', data, {'Content-Type': 'application/json'})
res = json.loads(urllib.request.urlopen(req).read())
print(f\"View at: {res['url']}\")
" plans/auth.md my-app/plans
```

## When to Use

After writing or updating:
- `plans/*.md` - Implementation plans
- `docs/*.md` - Documentation
- `specs/*.md` - Specifications
- Any long markdown file (50+ lines)

## To Commit to GitHub

After iterations are complete, commit to GitHub for permanent storage:

```bash
curl -s -X POST https://another-set-of-eyes.onrender.com/api/documents/DOC_ID/complete
```
