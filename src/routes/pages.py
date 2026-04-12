from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.db_models import User
from src.dependencies import authenticate_phrase, get_current_user
from src.services.document_store import DocumentStore

router = APIRouter()

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
