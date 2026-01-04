---
name: push-doc
description: Push markdown files to Another Set of Eyes viewer for reading on iPad/secondary display. Use after writing plans, docs, or specs to a .md file. Pushing the same file again updates the existing document (same URL). After user approval, call complete to commit to GitHub.
allowed-tools: Bash, Read
---

# Push Document to Another Set of Eyes

Push markdown files to a beautiful web viewer for reading on iPad or secondary displays.

## Workflow

1. **Write** a markdown file (plan, doc, spec)
2. **Push** to viewer → appears on iPad
3. **Iterate** → edit file, push again (same URL updates, iPad auto-refreshes)
4. **User approves** → call **complete** to commit to GitHub

## Command: Push

After writing a markdown file, push it:

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
print(f\"ID: {res['id']}\")
" FILE FOLDER
```

**Arguments:**
- `FILE` → path to the markdown file
- `FOLDER` → folder in docs repo (e.g., `project/plans`)

**Returns:** URL and document ID (save the ID for completing later)

## Command: Complete

After user approves the document, commit it to GitHub:

```bash
curl -s -X POST https://another-set-of-eyes.onrender.com/api/documents/DOC_ID/complete | python3 -c "import sys,json; r=json.load(sys.stdin); print(f\"Committed: {r.get('git',{}).get('url','N/A')}\")"
```

Replace `DOC_ID` with the document ID from the push command.

## How Updates Work

The `path` field (`folder/filename`) is the unique identifier:

```
First push:  plans/auth.md → creates doc/abc123
Edit file locally
Second push: plans/auth.md → UPDATES doc/abc123 (same URL!)
```

Your iPad auto-refreshes every 30 seconds via HTMX, so changes appear automatically.

## Example Session

```bash
# 1. Write the plan
# (Claude writes plans/auth.md)

# 2. Push to iPad
python3 -c "..." plans/auth.md my-app/plans
# Output: View at: https://.../doc/abc123
#         ID: abc123

# 3. User reads on iPad, requests changes
# (Claude edits plans/auth.md)

# 4. Push update (same URL)
python3 -c "..." plans/auth.md my-app/plans
# Output: View at: https://.../doc/abc123  (same!)

# 5. User approves
curl -s -X POST https://.../api/documents/abc123/complete
# Output: Committed to GitHub
```

## When to Use

After writing or updating:
- `plans/*.md` - Implementation plans
- `docs/*.md` - Documentation
- `specs/*.md` - Specifications
- Any long markdown file (50+ lines)
