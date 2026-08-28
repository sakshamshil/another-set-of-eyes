import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.db_models import User
from src.dependencies import authenticate_phrase, get_current_user
from src.services.document_store import DocumentStore, get_by_render_key

router = APIRouter()

_RENDER_KEY_RE = re.compile(r"^[0-9a-f]{32}$")

# The sandbox directive puts the response in an opaque origin even on a direct
# top-level visit. That is what keeps a pushed page away from the passphrase in
# localStorage. allow-same-origin is deliberately absent — adding it defeats the
# whole mechanism. No source directives are listed, so the page may still load
# Tailwind, Chart.js, fonts and anything else it needs from a CDN.
_RENDER_CSP = (
    "sandbox allow-scripts allow-popups allow-forms allow-downloads; "
    "frame-ancestors 'self'"
)

templates_path = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=templates_path)


def timeago(dt: datetime) -> str:
    now = datetime.utcnow()
    diff = now - dt
    seconds = diff.total_seconds()
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        return f"{int(seconds // 60)}m ago"
    elif seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    else:
        return f"{int(seconds // 86400)}d ago"


templates.env.filters["timeago"] = timeago


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Dashboard shell — no auth needed, JS handles auth gate."""
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/doc/{doc_id}", response_class=HTMLResponse)
async def document_page(
    request: Request,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Direct browser visit: always returns the app shell — no auth needed.
    JS reads initial_doc_id, shows auth gate if needed, then fetches content.

    AJAX fetch (X-Requested-With header): authenticates and returns doc fragment.
    """
    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        return templates.TemplateResponse("index.html", {
            "request": request,
            "initial_doc_id": doc_id,
        })

    # AJAX path — extract phrase and authenticate
    authorization = request.headers.get("Authorization", "")
    token = request.query_params.get("token")
    phrase = authorization[7:] if authorization.startswith("Bearer ") else token

    if not phrase:
        raise HTTPException(status_code=401, detail="API key required")

    user = await authenticate_phrase(phrase, db)
    store = DocumentStore(db, user.id)
    doc = await store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return templates.TemplateResponse("doc.html", {"request": request, "doc": doc})


@router.get("/partials/doc-list", response_class=HTMLResponse)
async def document_list_partial(
    request: Request,
    status: Optional[str] = Query("active"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """HTMX partial — JS injects Authorization header via htmx:configRequest."""
    store = DocumentStore(db, user.id)
    documents = await store.list(status=status)
    return templates.TemplateResponse("partials/doc_list.html", {
        "request": request,
        "documents": documents,
        "status": status,
    })


@router.get("/r/{render_key}")
async def render_html_document(
    render_key: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve a pushed HTML doc as a real page, in a sandbox.

    No passphrase. The key in the URL is the capability, which is what lets a
    frame load this and what lets the page open on any device. A frame cannot
    send an Authorization header, and the passphrase must never sit in this URL
    because the sandboxed page can read its own location.
    """
    if not _RENDER_KEY_RE.match(render_key):
        raise HTTPException(status_code=404, detail="Not found")

    doc = await get_by_render_key(db, render_key)
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    return Response(
        content=doc.content,
        # Just "text/html" — Starlette appends "; charset=utf-8" itself, and
        # spelling it out here produces a doubled charset in the header.
        media_type="text/html",
        headers={
            "Content-Security-Policy": _RENDER_CSP,
            "X-Frame-Options": "SAMEORIGIN",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
        },
    )
