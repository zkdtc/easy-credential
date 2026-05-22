"""Badge artwork storage and generation helpers."""
from __future__ import annotations

import base64
import hashlib
import html
import textwrap
import uuid
from pathlib import Path

import httpx

from app.config import REPO_ROOT, get_settings

MAX_BADGE_IMAGE_BYTES = 5 * 1024 * 1024
UPLOAD_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
GENERATED_CONTENT_TYPE = "image/svg+xml"


def validate_uploaded_image(data: bytes, content_type: str | None) -> str:
    if not data:
        raise ValueError("empty_file")
    if len(data) > MAX_BADGE_IMAGE_BYTES:
        raise ValueError("file_too_large")
    if content_type not in UPLOAD_CONTENT_TYPES:
        raise ValueError("unsupported_image_type")
    if content_type == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("invalid_png")
    if content_type == "image/jpeg" and not data.startswith(b"\xff\xd8\xff"):
        raise ValueError("invalid_jpeg")
    if content_type == "image/webp" and not (
        data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    ):
        raise ValueError("invalid_webp")
    return UPLOAD_CONTENT_TYPES[content_type]


def save_badge_asset(
    *,
    org_id: uuid.UUID,
    data: bytes,
    extension: str,
) -> str:
    settings = get_settings()
    media_root = media_root_path()
    relative_path = Path("badges") / str(org_id) / f"{uuid.uuid4().hex}{extension}"
    target = media_root / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return f"{settings.public_url.rstrip('/')}/media/{relative_path.as_posix()}"


def media_root_path() -> Path:
    path = Path(get_settings().media_root)
    return path if path.is_absolute() else REPO_ROOT / path


def generate_badge_image(
    *,
    prompt: str,
    style: str,
) -> tuple[bytes, str, str]:
    settings = get_settings()
    clean_prompt = prompt.strip()
    if not clean_prompt:
        raise ValueError("prompt_required")
    if settings.openai_api_key:
        try:
            return _generate_with_openai(clean_prompt, style)
        except (httpx.HTTPError, KeyError, ValueError):
            if settings.env != "development":
                raise
    return _generate_local_svg(clean_prompt, style), GENERATED_CONTENT_TYPE, "local"


def _generate_with_openai(prompt: str, style: str) -> tuple[bytes, str, str]:
    response = httpx.post(
        "https://api.openai.com/v1/images/generations",
        headers={
            "Authorization": f"Bearer {get_settings().openai_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-image-1",
            "prompt": _image_prompt(prompt, style),
            "size": "1024x1024",
            "quality": "low",
        },
        timeout=90,
    )
    response.raise_for_status()
    payload = response.json()
    image_base64 = payload["data"][0]["b64_json"]
    return base64.b64decode(image_base64), "image/png", "openai"


def _image_prompt(prompt: str, style: str) -> str:
    return (
        "Create a clean square digital badge for a verifiable credential. "
        "Use a centered emblem, readable composition, no small body text, "
        "transparent-safe background, and professional issuer style. "
        f"Visual direction: {style}. Badge concept: {prompt}."
    )


def _generate_local_svg(prompt: str, style: str) -> bytes:
    digest = hashlib.sha256(f"{style}:{prompt}".encode()).digest()
    palette = [
        ("#0f172a", "#0284c7", "#22c55e"),
        ("#111827", "#7c3aed", "#06b6d4"),
        ("#172554", "#f59e0b", "#10b981"),
        ("#312e81", "#e11d48", "#38bdf8"),
    ][digest[0] % 4]
    title = " ".join(prompt.split()[:5]).title() or "Credential"
    title_lines = textwrap.wrap(title, width=16)[:3]
    escaped_lines = [html.escape(line) for line in title_lines]
    line_markup = "\n".join(
        f'<text x="256" y="{292 + index * 38}" class="title">{line}</text>'
        for index, line in enumerate(escaped_lines)
    )
    initials = "".join(word[0] for word in title.split()[:2]).upper()[:2] or "EC"
    style_label = html.escape(style.title()[:28])
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="{palette[0]}"/>
      <stop offset="55%" stop-color="{palette[1]}"/>
      <stop offset="100%" stop-color="{palette[2]}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#020617" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="88" fill="url(#bg)"/>
  <circle cx="256" cy="224" r="142" fill="#ffffff" opacity="0.18"/>
  <circle cx="256" cy="224" r="110" fill="#ffffff" opacity="0.92" filter="url(#shadow)"/>
  <circle cx="256" cy="224" r="72" fill="#0f172a"/>
  <text x="256" y="244" class="mark">{html.escape(initials)}</text>
  {line_markup}
  <text x="256" y="430" class="style">{style_label}</text>
  <style>
    text {{ font-family: Inter, Arial, sans-serif; text-anchor: middle; }}
    .mark {{ fill: white; font-size: 56px; font-weight: 900; letter-spacing: 2px; }}
    .title {{ fill: white; font-size: 30px; font-weight: 800; }}
    .style {{
      fill: #ffffff;
      opacity: 0.82;
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
    }}
  </style>
</svg>"""
    return svg.encode("utf-8")
