from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.db_models import User
from src.models import AuthRequest
from src.dependencies import hash_phrase

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/token")
async def get_token(body: AuthRequest, db: AsyncSession = Depends(get_db)):
    """Verify or create account for a phrase.
    Returns the same 200 response regardless — no oracle leaking whether the phrase existed.
    """
    phrase_hash = hash_phrase(body.phrase)
    result = await db.execute(select(User).where(User.phrase_hash == phrase_hash))
    user = result.scalar_one_or_none()

    if not user:
        user = User(phrase_hash=phrase_hash)
        db.add(user)
        await db.commit()

    return {"ok": True}
