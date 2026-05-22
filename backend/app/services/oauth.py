"""OAuth client registry (Authlib).

Providers: google, facebook, apple, github (decision Q1 = D).

Each provider is registered only if its client_id/secret are present. Apple's
client_secret is generated on demand (signed JWT) since Apple's "Sign in with
Apple" doesn't use a long-lived secret.
"""
from __future__ import annotations

import time
from typing import Any

import jwt  # PyJWT — bundled with cryptography
from authlib.integrations.starlette_client import OAuth

from app.config import get_settings

_oauth: OAuth | None = None


def _build_apple_client_secret(settings) -> str:
    """Apple requires a signed ES256 JWT as the OAuth client secret."""
    now = int(time.time())
    headers = {"kid": settings.apple_key_id}
    payload = {
        "iss": settings.apple_team_id,
        "iat": now,
        "exp": now + 60 * 60 * 24 * 30,  # max 6 months; we use 30 days
        "aud": "https://appleid.apple.com",
        "sub": settings.apple_client_id,
    }
    return jwt.encode(
        payload, settings.apple_private_key, algorithm="ES256", headers=headers
    )


def get_oauth() -> OAuth:
    global _oauth
    if _oauth is not None:
        return _oauth
    settings = get_settings()
    oauth = OAuth()

    if settings.google_client_id and settings.google_client_secret:
        oauth.register(
            name="google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    if settings.facebook_client_id and settings.facebook_client_secret:
        oauth.register(
            name="facebook",
            client_id=settings.facebook_client_id,
            client_secret=settings.facebook_client_secret,
            access_token_url="https://graph.facebook.com/v18.0/oauth/access_token",
            authorize_url="https://www.facebook.com/v18.0/dialog/oauth",
            api_base_url="https://graph.facebook.com/v18.0/",
            client_kwargs={"scope": "email public_profile"},
        )

    if settings.apple_client_id and settings.apple_team_id and settings.apple_key_id \
            and settings.apple_private_key:
        oauth.register(
            name="apple",
            client_id=settings.apple_client_id,
            client_secret=_build_apple_client_secret(settings),
            server_metadata_url="https://appleid.apple.com/.well-known/openid-configuration",
            client_kwargs={"scope": "name email", "response_mode": "form_post"},
        )

    # GitHub doesn't use distinct env vars in v0 scaffold; piggyback on its own
    # pair if present. We add dedicated fields in a follow-up if you'd like.
    gh_id = getattr(settings, "github_client_id", "") or ""
    gh_secret = getattr(settings, "github_client_secret", "") or ""
    if gh_id and gh_secret:
        oauth.register(
            name="github",
            client_id=gh_id,
            client_secret=gh_secret,
            access_token_url="https://github.com/login/oauth/access_token",
            authorize_url="https://github.com/login/oauth/authorize",
            api_base_url="https://api.github.com/",
            client_kwargs={"scope": "read:user user:email"},
        )

    _oauth = oauth
    return oauth


# ---------- profile normalization ----------
def normalize_profile(provider: str, token: dict, userinfo: dict[str, Any]) -> dict[str, Any]:
    """Return a uniform dict: {sub, email, name, avatar_url}."""
    if provider == "google":
        return {
            "sub": str(userinfo.get("sub") or token.get("userinfo", {}).get("sub", "")),
            "email": userinfo.get("email") or "",
            "name": userinfo.get("name") or "",
            "avatar_url": userinfo.get("picture"),
        }
    if provider == "facebook":
        return {
            "sub": str(userinfo.get("id", "")),
            "email": userinfo.get("email") or "",
            "name": userinfo.get("name") or "",
            "avatar_url": (
                userinfo.get("picture", {}).get("data", {}).get("url")
                if isinstance(userinfo.get("picture"), dict) else None
            ),
        }
    if provider == "apple":
        # Apple's id_token carries sub + email; name is only sent on the FIRST
        # auth as form fields.
        id_token = token.get("userinfo") or userinfo or {}
        return {
            "sub": str(id_token.get("sub", "")),
            "email": id_token.get("email") or "",
            "name": id_token.get("name") or "",
            "avatar_url": None,
        }
    if provider == "github":
        return {
            "sub": str(userinfo.get("id", "")),
            "email": userinfo.get("email") or "",
            "name": userinfo.get("name") or userinfo.get("login") or "",
            "avatar_url": userinfo.get("avatar_url"),
        }
    raise ValueError(f"unknown provider: {provider}")
