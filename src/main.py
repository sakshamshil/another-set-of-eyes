from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from src.routes import documents, pages
from src.config import get_settings

app = FastAPI(
    title="Document Viewer",
    description="A simple server for viewing markdown documents",
    version="0.1.0",
)

# API routes (JSON)
app.include_router(documents.router, prefix="/api")

# Page routes (HTML via Jinja2)
app.include_router(pages.router)

# Static files (CSS, JS)
static_path = Path(__file__).parent.parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/health")
async def health_check():
    """Health check endpoint for deployment."""
    settings = get_settings()
    return {"status": "healthy", "environment": settings.environment}


@app.get("/install", response_class=PlainTextResponse)
async def install_skill(request: Request):
    """Returns a shell script to install the push-doc skill."""
    skill_path = Path(__file__).parent.parent / "skill" / "SKILL.md"
    skill_content = skill_path.read_text()

    # Get the base URL from the request (so it uses whichever server you're installing from)
    base_url = str(request.base_url).rstrip("/")

    return f"""#!/bin/bash
mkdir -p ~/.claude/skills/push-doc
cat > ~/.claude/skills/push-doc/SKILL.md << 'SKILL_EOF'
{skill_content}
SKILL_EOF

# Set EYES_URL if not already set
if ! grep -q "EYES_URL" ~/.bashrc 2>/dev/null; then
  echo 'export EYES_URL="{base_url}"' >> ~/.bashrc
  echo "Added EYES_URL to ~/.bashrc"
fi

if ! grep -q "EYES_URL" ~/.zshrc 2>/dev/null; then
  echo 'export EYES_URL="{base_url}"' >> ~/.zshrc 2>/dev/null || true
fi

echo "Skill installed to ~/.claude/skills/push-doc/SKILL.md"
echo "EYES_URL set to {base_url}"
echo ""
echo "Run: source ~/.bashrc (or restart terminal)"
"""
