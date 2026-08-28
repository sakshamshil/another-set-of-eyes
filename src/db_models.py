import secrets
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from src.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phrase_hash = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(16), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False, default="")
    status = Column(String(20), nullable=False, default="active")
    source = Column(String, nullable=True)
    tags = Column(ARRAY(Text), nullable=False, server_default="{}")
    path = Column(String, nullable=True)
    # "markdown" or "html". HTML docs render inside a sandboxed frame, never on the app origin.
    kind = Column(String(20), nullable=False, default="markdown", server_default="markdown")
    # Random per-doc key. A frame cannot send an Authorization header, so the URL carries this
    # instead. Never the passphrase — a sandboxed page can read its own URL.
    render_key = Column(String(32), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="documents")


def new_render_key() -> str:
    """128 bits of entropy, hex encoded — URL safe and easy to validate."""
    return secrets.token_hex(16)
