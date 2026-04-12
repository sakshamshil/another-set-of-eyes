import hashlib
import time
from typing import Optional

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.database import get_db
from src.db_models import User

# In-memory cache: raw phrase -> (user_id str, expiry timestamp)
# Avoids re-running PBKDF2 (100k iterations ~10ms) on every request.
# Phrases live only in memory — not persisted anywhere.
_phrase_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 300  # 5 minutes


def hash_phrase(phrase: str) -> str:
    """PBKDF2-HMAC-SHA256 with server secret as salt.
    100k iterations makes offline brute force expensive.
    Deterministic — same phrase + same secret = same hash — so DB lookup works.
    """
    secret = get_settings().phrase_secret
    return hashlib.pbkdf2_hmac(
        "sha256",
        phrase.encode("utf-8"),
        secret.encode("utf-8"),
        100_000,
    ).hex()


async def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    phrase = None
    if authorization and authorization.startswith("Bearer "):
        phrase = authorization[7:]
    elif token:
        phrase = token

    if not phrase:
        raise HTTPException(status_code=401, detail="API key required")

    # Cache hit — skip expensive PBKDF2 computation
    cached = _phrase_cache.get(phrase)
    if cached:
        user_id, expiry = cached
        if time.monotonic() < expiry:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                return user
        else:
            del _phrase_cache[phrase]

    # Cache miss — compute hash and query DB
    phrase_hash = hash_phrase(phrase)
    result = await db.execute(select(User).where(User.phrase_hash == phrase_hash))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid phrase")

    _phrase_cache[phrase] = (str(user.id), time.monotonic() + _CACHE_TTL)
    return user
