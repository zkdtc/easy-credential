"""Badge artwork upload and generation APIs."""
from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from app.db import get_db
from app.deps import current_user, require_csrf
from app.models import User
from app.services.badge_assets import (
    generate_badge_image,
    save_badge_asset,
    validate_uploaded_image,
)
from app.services.permissions import require_org_role

router = APIRouter(tags=["badge artwork"])


class BadgeGenerationRequest(BaseModel):
    org_id: uuid.UUID
    prompt: str = Field(min_length=3, max_length=500)
    style: str = Field(default="modern", max_length=80)


@router.post(
    "/assets/badges/upload",
    dependencies=[Depends(require_csrf)],
)
async def upload_badge_image(
    org_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    require_org_role(db, user=user, org_id=org_id)
    data = await file.read()
    try:
        extension = validate_uploaded_image(data, file.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    image_url = save_badge_asset(org_id=org_id, data=data, extension=extension)
    return {
        "image_url": image_url,
        "source": "upload",
        "content_type": file.content_type,
    }


@router.post(
    "/ai/design/image",
    dependencies=[Depends(require_csrf)],
)
def generate_badge(
    body: BadgeGenerationRequest,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    org, _membership = require_org_role(db, user=user, org_id=body.org_id)
    try:
        image_data, content_type, source = generate_badge_image(
            prompt=f"{body.prompt}. Issuer: {org.name}",
            style=body.style,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="ai_provider_unavailable") from exc

    extension = ".png" if content_type == "image/png" else ".svg"
    image_url = save_badge_asset(org_id=org.id, data=image_data, extension=extension)
    return {
        "image_url": image_url,
        "source": source,
        "content_type": content_type,
    }
