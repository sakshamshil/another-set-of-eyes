from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from src.config import get_settings
from src.database import engine
from src.db_models import Base  # noqa: F401 — imported so Base.metadata includes all models
import src.db_models  # noqa: F401
from src.limiter import limiter
from src.routes import documents, pages
from src.routes.auth import router as auth_router

_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' "
    "https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' "
    "https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
    "font-src https://fonts.gstatic.com; "
    "connect-src 'self'; "
    "img-src 'self' data: https:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self';"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # /r/{key} serves user-pushed HTML and sets its own, stricter policy:
        # a CSP sandbox that forces an opaque origin. Overwriting it here would
        # both break the sandbox and stop the app framing its own pages, since
        # X-Frame-Options: DENY blocks even same-origin frames.
        if not request.url.path.startswith("/r/"):
            response.headers["Content-Security-Policy"] = _CSP
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Every dynamic response here is per-user document content. Without this
        # a browser (iOS Safari especially) may serve a heuristically cached copy,
        # which makes the refresh button look broken. /static/ keeps its own
        # validators from StaticFiles.
        if not request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-store"

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        )
        # HSTS: enforce HTTPS for 1 year + subdomains
        # Only send on HTTPS responses to avoid breaking HTTP dev setups
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.phrase_secret:
        raise RuntimeError(
            "PHRASE_SECRET is not set. "
            "Set it in your environment or .env file before starting the server."
        )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Another Set of Eyes",
    description="Document viewer with real-time updates",
    version="0.2.0",
    lifespan=lifespan,
)

# Rate limiting — state must be set before routes are registered
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)

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


# The npm package and this endpoint must hand out the same skill, so both read
# one file: cli/assets/SKILL.md. Keeping a second copy under skill/ only let the
# two drift, which is exactly what happened.
_SKILL_PATH = Path(__file__).parent.parent / "cli" / "assets" / "SKILL.md"

# Plain template rather than an f-string: the script below contains JSON braces,
# and doubling every one of them to survive .format is how mistakes get in.
_INSTALL_SCRIPT = """#!/bin/bash
set -e

mkdir -p ~/.claude/skills/push-doc
cat > ~/.claude/skills/push-doc/SKILL.md << 'SKILL_EOF'
__SKILL__
SKILL_EOF

mkdir -p ~/.asoe
python3 - << 'CONFIG_EOF'
import json, pathlib
cfg = pathlib.Path.home() / ".asoe" / "config.json"
data = {}
if cfg.exists():
    try:
        data = json.loads(cfg.read_text())
    except Exception:
        data = {}
data["url"] = "__BASE_URL__"
cfg.write_text(json.dumps(data, indent=2))
cfg.chmod(0o600)
print("Wrote URL to ~/.asoe/config.json")
CONFIG_EOF

echo ""
echo "Skill installed: ~/.claude/skills/push-doc/SKILL.md"
echo "ASOE_URL:        __BASE_URL__"
echo ""
if python3 -c "import json,pathlib,sys; sys.exit(0 if json.loads((pathlib.Path.home()/'.asoe'/'config.json').read_text()).get('token') else 1)" 2>/dev/null; then
  echo "Passphrase already set. You are ready to push."
else
  echo "One step left — this script cannot know your passphrase."
  echo "Set it with either of these:"
  echo ""
  echo "    npx asoe-install          # prompts for it, and covers other agents too"
  echo "    export ASOE_TOKEN='your passphrase'"
  echo ""
fi
"""


@app.get("/install", response_class=PlainTextResponse)
async def install_skill(request: Request):
    """Return a bash script that installs the push-doc skill for Claude Code.

    `npx asoe-install` is the fuller path — it detects other agents and prompts
    for the passphrase. This endpoint stays for `curl <url>/install | bash`.
    """
    base_url = str(request.base_url).rstrip("/")
    return (
        _INSTALL_SCRIPT
        .replace("__SKILL__", _SKILL_PATH.read_text().rstrip("\n"))
        .replace("__BASE_URL__", base_url)
    )
