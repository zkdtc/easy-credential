"""Server-side session management (decision Q3=A).

Session lifetime: 30 days, sliding (last_used_at bumped on touch).
Cookie name: `ec_session` (httpOnly, Secure in prod, SameSite=Lax).
CSRF: a separate non-httpOnly cookie + matching header on mutations.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Request, Response
from sqlalchemy import delete
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import Session as SessionRow
from app.models import User

SESSION_COOKIE = "ec_session"
CSRF_COOKIE = "ec_csrf"
SESSION_LIFETIME = timedelta(days=30)


def _is_prod() -> bool:
    return get_settings().env.lower() == "production"


def _cookie_kwargs() -> dict:
    settings = get_settings()
    kwargs = {
        "httponly": True,
        "secure": _is_prod(),
        "samesite": "lax",
        "path": "/",
        "max_age": int(SESSION_LIFETIME.total_seconds()),
    }
    if settings.cookie_domain and settings.cookie_domain != "localhost":
        kwargs["domain"] = settings.cookie_domain
    return kwargs


def create_session(db: DbSession, user: User, request: Request, response: Response) -> SessionRow:
    """Create a new session row, set httpOnly cookie + CSRF cookie."""
    now = datetime.now(UTC)
    row = SessionRow(
        id=uuid.uuid4(),
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        ip=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:512],
        created_at=now,
        last_used_at=now,
        expires_at=now + SESSION_LIFETIME,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    response.set_cookie(SESSION_COOKIE, str(row.id), **_cookie_kwargs())
    csrf_kwargs = _cookie_kwargs() | {"httponly": False}
    response.set_cookie(CSRF_COOKIE, row.csrf_token, **csrf_kwargs)
    return row


def revoke_session(db: DbSession, session_id: uuid.UUID, response: Response) -> None:
    db.execute(delete(SessionRow).where(SessionRow.id == session_id))
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def load_session(db: DbSession, request: Request) -> SessionRow | None:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    try:
        sid = uuid.UUID(raw)
    except ValueError:
        return None
    row = db.get(SessionRow, sid)
    if not row:
        return None
    if row.expires_at <= datetime.now(UTC):
        db.execute(delete(SessionRow).where(SessionRow.id == sid))
        db.commit()
        return None
    # Sliding window: bump last_used_at lazily (no commit hot-path)
    row.last_used_at = datetime.now(UTC)
    db.commit()
    return row
