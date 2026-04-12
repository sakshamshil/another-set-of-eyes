from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.db_models import User
from src.dependencies import get_current_user
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
    user: User = Depends(get_current_user),
):
    """
    AJAX fetch (X-Requested-With header): returns doc content fragment.
    Direct browser visit: returns shell with initial_doc_id so JS can load it.
    """
    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        # Shell for direct navigation — JS will fetch content via API after auth
        return templates.TemplateResponse("index.html", {
            "request": request,
            "initial_doc_id": doc_id,
        })

    store = DocumentStore(db, user.id)
    doc = await store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return templates.TemplateResponse("doc.html", {"request": request, "doc": doc})


@router.get("/partials/doc-list", response_class=HTMLResponse)
async def document_list_partial(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """HTMX partial — JS injects Authorization header via htmx:configRequest."""
    store = DocumentStore(db, user.id)
    documents = await store.list()
    return templates.TemplateResponse("partials/doc_list.html", {
        "request": request,
        "documents": documents,
    })
