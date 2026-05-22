"""Small authorization helpers for org-scoped routes."""
from __future__ import annotations

import uuid
from collections.abc import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Org, OrgMember, User


def require_org_role(
    db: DbSession,
    *,
    user: User,
    org_id: uuid.UUID,
    allowed_roles: Iterable[str] = ("owner", "admin", "issuer"),
) -> tuple[Org, OrgMember]:
    row = db.execute(
        select(Org, OrgMember)
        .join(OrgMember, OrgMember.org_id == Org.id)
        .where(Org.id == org_id, OrgMember.user_id == user.id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="org_not_found")
    org, membership = row
    if membership.role not in set(allowed_roles):
        raise HTTPException(status_code=403, detail="forbidden")
    return org, membership
