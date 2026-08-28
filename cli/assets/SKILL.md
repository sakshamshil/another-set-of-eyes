---
name: push-doc
description: Push markdown or HTML files to Another Set of Eyes after writing plans, docs, specs, dashboards, or reports so the user can read them on another screen. Use after writing any .md file over 50 lines, and after writing any .html file. Pushing the same file path updates the existing doc.
allowed-tools: Bash
---

# Push Document to Another Set of Eyes

Push plans, docs and HTML pages to the user's ASOE viewer so they appear as a live tab instantly.

## Setup

Requires two env vars (set by `npx asoe-install`):

- `ASOE_URL` — your ASOE instance URL
- `ASOE_TOKEN` — your passphrase

## When to Push

Push immediately after you write:
- Any implementation plan
- Any documentation or spec file
- Any markdown file over 50 lines
- Any `.html` file you build for the user — a report, a dashboard, a chart, a mockup

Do not ask. Just push.

## Push

```bash
python3 -c "
import urllib.request, json, re, sys, os, pathlib
file = sys.argv[1]
folder = sys.argv[2] if len(sys.argv) > 2 else 'docs'
base = os.environ.get('ASOE_URL', '')
token = os.environ.get('ASOE_TOKEN', '')
if not base or not token:
    cfg = pathlib.Path.home() / '.asoe' / 'config.json'
    if cfg.exists():
        c = json.loads(cfg.read_text())
        base = base or c.get('url', '')
        token = token or c.get('token', '')
base = (base or 'https://asoe.sakshamshil.xyz').rstrip('/')
if not token:
    print('Error: ASOE_TOKEN not set. Run: npx asoe-install')
    sys.exit(1)
content = open(file, encoding='utf-8').read()
name = os.path.basename(file)
kind = 'html' if name.lower().endswith(('.html', '.htm')) else 'markdown'
if kind == 'html':
    m = re.search(r'<title[^>]*>(.*?)</title>', content, re.S | re.I) or re.search(r'<h1[^>]*>(.*?)</h1>', content, re.S | re.I)
    title = re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else name
else:
    m = re.search(r'^# (.+)', content, re.M)
    title = m.group(1).strip() if m else name
path_key = folder.rstrip('/') + '/' + name
payload = json.dumps({'title': title or name, 'content': content, 'metadata': {'source': 'agent', 'path': path_key, 'kind': kind}}).encode()
req = urllib.request.Request(f'{base}/api/documents', payload, {'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
res = json.loads(urllib.request.urlopen(req).read())
print(f\"Pushed: {res['url']}\")
if res.get('render_url'):
    print(f\"Shareable page: {res['render_url']}\")
" FILE FOLDER
```

Replace `FILE` with the path to the file and `FOLDER` with a folder label (e.g. `my-project/plans`).

The script reads the file extension and sets `kind` for you. Give it the `.html` file directly.

## Markdown vs HTML

| Kind | How it renders | Link |
|---|---|---|
| `markdown` | Cleaned with DOMPurify, then styled by the app | Needs the passphrase |
| `html` | Runs as a real page inside a sandboxed frame | Works on any device, no passphrase |

An HTML doc keeps its own CSS and scripts, and it may load CDN libraries such as
Tailwind or Chart.js. The push response returns a `render_url`. That URL carries a
random key instead of the passphrase, so the user can open it anywhere or send it on.

Tell the user the `render_url` after you push an HTML file.

## How Updates Work

The `path` field is the unique key — pushing the same file twice updates the same doc at the same URL.

```
First push:   plans/auth.md  →  creates /doc/abc123
Edit locally
Second push:  plans/auth.md  →  updates /doc/abc123  (same URL)
```

An HTML doc keeps the same `render_url` across updates too. Refresh the page to see the new version.
