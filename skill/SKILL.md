---
name: push-doc
description: ALWAYS push markdown files to Another Set of Eyes viewer after writing plans, docs, or specs. This lets the user read on a second screen. Push immediately after writing any .md file over 50 lines. Pushing the same file updates the existing doc (same URL).
allowed-tools: Bash, Read
---

# Push Document to Another Set of Eyes

**IMPORTANT: Auto-push every plan/doc you write so the user can read it on another screen.**

## When to Push (Automatically)

Push immediately after writing:
- Any implementation plan
- Any documentation file
- Any spec or design doc
- Any markdown file over 50 lines

**Don't ask permission. Just push it.**

## Setup (once per machine)

```bash
export EYES_URL="https://another-set-of-eyes.koyeb.app"
```

## Command: Push

After writing a markdown file, push it:

```bash
python3 -c "
import urllib.request, json, re, sys, os
file, folder = sys.argv[1], sys.argv[2]
base = os.environ.get('EYES_URL', 'https://another-set-of-eyes.koyeb.app')
filename = os.path.basename(file)
content = open(file).read()
title = re.search(r'^# (.+)', content, re.M)
title = title.group(1) if title else filename
path = f'{folder}/{filename}'
data = json.dumps({'title': title, 'content': content, 'metadata': {'source': 'claude-code', 'path': path}}).encode()
req = urllib.request.Request(f'{base}/api/documents', data, {'Content-Type': 'application/json'})
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
curl -s -X POST ${EYES_URL:-https://another-set-of-eyes.koyeb.app}/api/documents/DOC_ID/complete | python3 -c "import sys,json; r=json.load(sys.stdin); print(f\"Committed: {r.get('git',{}).get('url','N/A')}\")"
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
curl -s -X POST $EYES_URL/api/documents/abc123/complete
# Output: Committed to GitHub
```

## When to Use

After writing or updating:
- `plans/*.md` - Implementation plans
- `docs/*.md` - Documentation
- `specs/*.md` - Specifications
- Any long markdown file (50+ lines)
