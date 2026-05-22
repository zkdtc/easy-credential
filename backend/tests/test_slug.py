"""Tests for slugify + unique_slug helpers."""
from __future__ import annotations

from app.services.slug import slugify, unique_slug


def test_slugify_basic():
    assert slugify("Acme Academy") == "acme-academy"
    assert slugify("  Hello, World! ") == "hello-world"
    assert slugify("123 ABC") == "123-abc"
    assert slugify("") == "org"


def test_unique_slug_no_conflict():
    assert unique_slug("Acme Academy", exists=lambda _s: False) == "acme-academy"


def test_unique_slug_with_conflict():
    seen = {"acme-academy"}
    out = unique_slug("Acme Academy", exists=lambda s: s in seen)
    assert out.startswith("acme-academy-")
    assert out != "acme-academy"
