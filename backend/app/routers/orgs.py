"""Org management."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import current_user, require_csrf
from app.models import Org, OrgMember, User
from app.services.slug import unique_slug

router = APIRouter(prefix="/orgs", tags=["orgs"])


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=80)


class OrgPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    logo_url: str | None = None
    website: str | None = None


def _serialize(o: Org, role: str | None = None) -> dict:
    out = {
        "id": str(o.id),
        "name": o.name,
        "slug": o.slug,
        "logo_url": o.logo_url,
        "website": o.website,
        "verified": o.verified,
        "feature_flags": o.feature_flags or {},
    }
    if role:
        out["role"] = role
    return out


@router.get("/mine")
def my_orgs(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    rows = db.execute(
        select(Org, OrgMember.role)
        .join(OrgMember, OrgMember.org_id == Org.id)
        .where(OrgMember.user_id == user.id)
    ).all()
    return [_serialize(o, role) for (o, role) in rows]


@router.post("", status_code=201, dependencies=[Depends(require_csrf)])
def create_org(
    body: OrgCreate, user: User = Depends(current_user), db: DbSession = Depends(get_db)
):
    slug = unique_slug(
        body.slug or body.name,
        exists=lambda s: db.execute(select(Org.id).where(Org.slug == s)).first() is not None,
    )
    org = Org(id=uuid.uuid4(), name=body.name, slug=slug)
    db.add(org)
    db.flush()
    db.add(OrgMember(org_id=org.id, user_id=user.id, role="owner"))
    if user.default_org_id is None:
        user.default_org_id = org.id
    db.commit()
    db.refresh(org)
    return _serialize(org, role="owner")


@router.patch("/{org_id}", dependencies=[Depends(require_csrf)])
def update_org(
    org_id: uuid.UUID,
    body: OrgPatch,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    membership = db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org_id, OrgMember.user_id == user.id
        )
    ).scalar_one_or_none()
    if not membership or membership.role not in {"owner", "admin"}:
        raise HTTPException(403, detail="forbidden")
    org = db.get(Org, org_id)
    if not org:
        raise HTTPException(404, detail="org_not_found")
    fields = body.model_fields_set
    if "name" in fields:
        org.name = body.name
    if "logo_url" in fields:
        org.logo_url = body.logo_url
    if "website" in fields:
        org.website = body.website
    db.commit()
    db.refresh(org)
    return _serialize(org, role=membership.role)
