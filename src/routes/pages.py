from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from datetime import datetime
from pathlib import Path

from src.services.document_store import store

router = APIRouter()

# Setup templates
templates_path = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=templates_path)


def timeago(dt: datetime) -> str:
    """Convert datetime to relative time string."""
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


# Register custom filter
templates.env.filters["timeago"] = timeago


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Render dashboard page."""
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/doc/{doc_id}", response_class=HTMLResponse)
async def document_page(request: Request, doc_id: str):
    """Render document viewer page."""
    doc = store.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return templates.TemplateResponse("doc.html", {
        "request": request,
        "doc": doc,
    })


@router.get("/partials/doc-list", response_class=HTMLResponse)
async def document_list_partial(request: Request):
    """Return document list HTML fragment for HTMX."""
    documents = store.list()
    return templates.TemplateResponse("partials/doc_list.html", {
        "request": request,
        "documents": documents,
    })
