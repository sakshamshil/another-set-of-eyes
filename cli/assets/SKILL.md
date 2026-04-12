---
name: push-doc
description: Push markdown files to Another Set of Eyes after writing plans, docs, or specs so the user can read them on another screen. Use after writing any .md file over 50 lines. Pushing the same file path updates the existing doc.
allowed-tools: Bash
---

# Push Document to Another Set of Eyes

Push plans and docs to the user's ASOE viewer so they appear as a live tab instantly.

## Setup

Requires two env vars (set by `npx asoe-install`):

- `ASOE_URL` — your ASOE instance URL
- `ASOE_TOKEN` — your passphrase

## When to Push

Push immediately after writing:
- Any implementation plan
- Any documentation or spec file
- Any markdown file over 50 lines

Do not ask. Just push.

## Push

```bash
python3 -c "
import urllib.request, json, re, sys, os
file = sys.argv[1]
folder = sys.argv[2] if len(sys.argv) > 2 else 'docs'
base = os.environ.get('ASOE_URL', 'https://asoe.sakshamshil.xyz').rstrip('/')
token = os.environ.get('ASOE_TOKEN', '')
if not token:
    print('Error: ASOE_TOKEN not set. Run: npx asoe-install')
    sys.exit(1)
content = open(file).read()
title = re.search(r'^# (.+)', content, re.M)
title = title.group(1) if title else os.path.basename(file)
path_key = folder.rstrip('/') + '/' + os.path.basename(file)
payload = json.dumps({'title': title, 'content': content, 'metadata': {'source': 'agent', 'path': path_key}}).encode()
req = urllib.request.Request(f'{base}/api/documents', payload, {'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
res = json.loads(urllib.request.urlopen(req).read())
print(f\"Pushed: {res['url']}\")
" FILE FOLDER
```

Replace `FILE` with the path to the markdown file and `FOLDER` with a folder label (e.g. `my-project/plans`).

## How Updates Work

The `path` field is the unique key — pushing the same file twice updates the same doc at the same URL.

```
First push:   plans/auth.md  →  creates /doc/abc123
Edit locally
Second push:  plans/auth.md  →  updates /doc/abc123  (same URL)
```
