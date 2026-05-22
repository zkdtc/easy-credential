"""Org bootstrap on first login (decision Q2 = A — auto-create personal org)."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Org, OrgMember, User
from app.services.slug import unique_slug


def ensure_default_org(db: DbSession, user: User) -> Org:
    """Idempotent: ensure user has at least one org & a default_org_id."""
    if user.default_org_id:
        org = db.get(Org, user.default_org_id)
        if org:
            return org

    # Use existing membership if any
    existing = db.execute(
        select(Org).join(OrgMember, OrgMember.org_id == Org.id)
                   .where(OrgMember.user_id == user.id)
    ).scalars().first()
    if existing:
        user.default_org_id = existing.id
        db.commit()
        return existing

    base = (user.name or user.email.split("@")[0] or "personal") + "-org"
    slug = unique_slug(
        base,
        exists=lambda s: db.execute(select(Org.id).where(Org.slug == s)).first() is not None,
    )
    org = Org(
        id=uuid.uuid4(),
        name=(user.name or user.email.split("@")[0]) + "'s Org",
        slug=slug,
    )
    db.add(org)
    db.flush()
    db.add(OrgMember(org_id=org.id, user_id=user.id, role="owner"))
    user.default_org_id = org.id
    db.commit()
    db.refresh(org)
    return org
