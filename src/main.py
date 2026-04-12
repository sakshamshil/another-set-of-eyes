from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles

from src.config import get_settings
from src.database import engine
from src.db_models import Base  # noqa: F401 — imported so Base.metadata includes all models
import src.db_models  # noqa: F401
from src.routes import documents, pages
from src.routes.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Another Set of Eyes",
    description="Document viewer with real-time updates",
    version="0.2.0",
    lifespan=lifespan,
)

app.include_router(auth_router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(pages.router)

static_path = Path(__file__).parent.parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/health")
async def health_check():
    settings = get_settings()
    return {"status": "healthy", "environment": settings.environment}


@app.get("/install", response_class=PlainTextResponse)
async def install_skill(request: Request):
    skill_path = Path(__file__).parent.parent / "skill" / "SKILL.md"
    skill_content = skill_path.read_text()
    base_url = str(request.base_url).rstrip("/")

    return f"""#!/bin/bash
mkdir -p ~/.claude/skills/push-doc
cat > ~/.claude/skills/push-doc/SKILL.md << 'SKILL_EOF'
{skill_content}
SKILL_EOF

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
