"""Tests for badge upload validation and local generation."""
from __future__ import annotations

from app.config import get_settings
from app.services.badge_assets import (
    GENERATED_CONTENT_TYPE,
    generate_badge_image,
    validate_uploaded_image,
)


def test_validate_uploaded_image_accepts_png_magic_bytes() -> None:
    data = b"\x89PNG\r\n\x1a\n" + b"0" * 16

    assert validate_uploaded_image(data, "image/png") == ".png"


def test_validate_uploaded_image_rejects_mismatched_type() -> None:
    data = b"not really a png"

    try:
        validate_uploaded_image(data, "image/png")
    except ValueError as exc:
        assert str(exc) == "invalid_png"
    else:  # pragma: no cover
        raise AssertionError("expected invalid_png")


def test_local_badge_generation_returns_svg(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()

    try:
        data, content_type, source = generate_badge_image(
            prompt="advanced product leadership",
            style="modern",
        )
    finally:
        get_settings.cache_clear()

    assert content_type == GENERATED_CONTENT_TYPE
    assert source == "local"
    assert data.startswith(b"<svg")
    assert b"Advanced Product" in data
