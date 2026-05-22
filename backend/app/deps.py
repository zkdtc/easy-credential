"""Reusable FastAPI dependencies for auth + CSRF."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.models import Session as SessionRow
from app.models import User
from app.services.sessions import CSRF_COOKIE, load_session


def current_session(
    request: Request, db: DbSession = Depends(get_db)
) -> SessionRow:
    sess = load_session(db, request)
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="not_authenticated")
    return sess


def current_user(
    sess: SessionRow = Depends(current_session),
    db: DbSession = Depends(get_db),
) -> User:
    user = db.get(User, sess.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="user_missing")
    return user


def require_csrf(
    request: Request, sess: SessionRow = Depends(current_session)
) -> SessionRow:
    """Enforce double-submit CSRF token on mutating requests.

    Skip for safe methods. For mutations, require header `X-CSRF-Token`
    to equal the value of the `ec_csrf` cookie AND the session's stored token.
    """
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return sess
    header = request.headers.get("x-csrf-token")
    cookie = request.cookies.get(CSRF_COOKIE)
    if not header or not cookie or header != cookie or header != sess.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="csrf_invalid")
    return sess
