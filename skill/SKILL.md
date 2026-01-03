---
name: push-doc
description: Push markdown files to Another Set of Eyes viewer for reading on iPad/secondary display. Use after writing plans, docs, or specs to a .md file.
allowed-tools: Bash, Read
---

# Push Document to Another Set of Eyes

Push markdown files to a beautiful web viewer for reading on iPad or secondary displays.

## Workflow

After writing a markdown file (e.g., `plans/feature.md`), push it:

```bash
python3 << 'EOF'
import httpx

# Read the file
with open("PATH_TO_FILE", "r") as f:
    content = f.read()

# Extract title from first heading or use filename
import re
title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
title = title_match.group(1) if title_match else "PATH_TO_FILE"

data = {
    "title": title,
    "content": content,
    "metadata": {
        "source": "claude-code",
        "path": "PROJECT_NAME/FOLDER"
    }
}

r = httpx.post("https://another-set-of-eyes.onrender.com/api/documents", json=data)
doc = r.json()
print(f"View at: {doc['url']}")
EOF
```

Replace:
- `PATH_TO_FILE` with the actual file path
- `PROJECT_NAME/FOLDER` with a logical path (e.g., `my-app/plans`)

## Complete Example

After writing `plans/auth-implementation.md`:

```bash
python3 << 'EOF'
import httpx
import re

with open("plans/auth-implementation.md", "r") as f:
    content = f.read()

title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
title = title_match.group(1) if title_match else "Auth Implementation"

r = httpx.post(
    "https://another-set-of-eyes.onrender.com/api/documents",
    json={
        "title": title,
        "content": content,
        "metadata": {"source": "claude-code", "path": "my-project/plans"}
    }
)
print(f"View at: {r.json()['url']}")
EOF
```

## When to Use

After writing any of these:
- `plans/*.md` - Implementation plans
- `docs/*.md` - Documentation
- `specs/*.md` - Specifications
- `*.md` - Any long markdown content

## Commit to GitHub (Optional)

To permanently save:
```bash
curl -X POST https://another-set-of-eyes.onrender.com/api/documents/{id}/complete
```
