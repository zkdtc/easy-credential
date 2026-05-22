"""Slug helpers."""
from __future__ import annotations

import re
import secrets
from collections.abc import Callable

_SLUG_SAFE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    """Lower-case kebab-style slug, alnum only."""
    s = _SLUG_SAFE.sub("-", text.lower()).strip("-")
    return s or "org"


def unique_slug(base: str, exists: Callable[[str], bool]) -> str:
    """Return a slug not already taken, appending a short random suffix if needed."""
    candidate = slugify(base)[:60] or "org"
    if not exists(candidate):
        return candidate
    for _ in range(5):
        suffix = secrets.token_hex(3)
        c = f"{candidate}-{suffix}"
        if not exists(c):
            return c
    # Last-resort: fully random
    return f"org-{secrets.token_hex(6)}"
