"""Authentication routes: OAuth login + callback + logout + /me."""
from __future__ import annotations

import uuid
from typing import Literal

from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.deps import current_session, current_user
from app.models import User
from app.services.oauth import get_oauth, normalize_profile
from app.services.orgs import ensure_default_org
from app.services.sessions import create_session, revoke_session

router = APIRouter(prefix="/auth", tags=["auth"])

Provider = Literal["google", "facebook", "apple", "github"]


class DevLoginRequest(BaseModel):
    email: EmailStr = "demo@easylearning.ai"
    name: str = Field(default="Demo Issuer", min_length=1, max_length=255)


@router.get("/{provider}/login")
async def login(provider: Provider, request: Request):
    oauth = get_oauth()
    client = getattr(oauth, provider, None)
    if client is None:
        raise HTTPException(status_code=503, detail=f"{provider}_not_configured")
    settings = get_settings()
    redirect_uri = f"{settings.api_url.rstrip('/')}/auth/{provider}/callback"
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/{provider}/callback")
async def callback(provider: Provider, request: Request, db: DbSession = Depends(get_db)):
    oauth = get_oauth()
    client = getattr(oauth, provider, None)
    if client is None:
        raise HTTPException(status_code=503, detail=f"{provider}_not_configured")

    try:
        token = await client.authorize_access_token(request)
    except OAuthError as exc:
        raise HTTPException(
            status_code=400, detail=f"oauth_error:{exc.error}"
        ) from exc

    # Fetch userinfo
    if provider == "github":
        resp = await client.get("user", token=token)
        userinfo = resp.json()
        if not userinfo.get("email"):
            emails = (await client.get("user/emails", token=token)).json()
            primary = next((e for e in emails if e.get("primary")), None)
            if primary:
                userinfo["email"] = primary["email"]
    elif provider == "facebook":
        resp = await client.get(
            "me?fields=id,name,email,picture.type(large)", token=token
        )
        userinfo = resp.json()
    elif provider == "google":
        userinfo = token.get("userinfo") or (await client.userinfo(token=token))
    else:  # apple
        userinfo = token.get("userinfo") or {}

    profile = normalize_profile(provider, token, userinfo)
    if not profile["sub"] or not profile["email"]:
        raise HTTPException(status_code=400, detail="oauth_missing_profile")

    # Upsert user
    user = db.execute(
        select(User).where(
            User.auth_provider == provider,
            User.provider_subject == profile["sub"],
        )
    ).scalar_one_or_none()

    if user is None:
        # Allow merge by email if existing account with same email exists
        user = db.execute(
            select(User).where(User.email == profile["email"])
        ).scalar_one_or_none()
        if user is None:
            user = User(
                id=uuid.uuid4(),
                email=profile["email"],
                name=profile["name"],
                avatar_url=profile["avatar_url"],
                auth_provider=provider,
                provider_subject=profile["sub"],
            )
            db.add(user)
        else:
            user.auth_provider = provider
            user.provider_subject = profile["sub"]
            user.name = user.name or profile["name"]
            user.avatar_url = user.avatar_url or profile["avatar_url"]
        db.commit()
        db.refresh(user)

    ensure_default_org(db, user)

    # Create session + cookies + redirect to dashboard
    settings = get_settings()
    response = RedirectResponse(url=settings.app_url, status_code=302)
    create_session(db, user, request, response)
    return response


@router.post("/dev-login")
def dev_login(
    body: DevLoginRequest,
    request: Request,
    db: DbSession = Depends(get_db),
):
    """Create a local development session without OAuth provider credentials."""
    settings = get_settings()
    if settings.env.lower() == "production":
        raise HTTPException(status_code=404, detail="not_found")

    email = str(body.email).lower()
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            id=uuid.uuid4(),
            email=email,
            name=body.name,
            avatar_url=None,
            auth_provider="github",
            provider_subject=f"dev:{email}",
        )
        db.add(user)
    else:
        user.name = user.name or body.name
        user.auth_provider = "github"
        user.provider_subject = f"dev:{email}"
    db.commit()
    db.refresh(user)
    ensure_default_org(db, user)

    response = JSONResponse({"ok": True})
    create_session(db, user, request, response)
    return response


@router.post("/logout")
def logout(
    request: Request,
    sess=Depends(current_session),
    db: DbSession = Depends(get_db),
):
    response = JSONResponse({"ok": True})
    revoke_session(db, sess.id, response)
    return response


@router.get("/me")
def me(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    from app.models import Org, OrgMember
    memberships = db.execute(
        select(Org, OrgMember.role)
        .join(OrgMember, OrgMember.org_id == Org.id)
        .where(OrgMember.user_id == user.id)
    ).all()
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "auth_provider": user.auth_provider,
        "default_org_id": str(user.default_org_id) if user.default_org_id else None,
        "orgs": [
            {
                "id": str(o.id),
                "name": o.name,
                "slug": o.slug,
                "logo_url": o.logo_url,
                "website": o.website,
                "verified": o.verified,
                "role": role,
            }
            for (o, role) in memberships
        ],
    }
