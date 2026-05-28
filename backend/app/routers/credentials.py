"""Issuer credential APIs and public verification endpoints."""
from __future__ import annotations

import html
import uuid
from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from urllib.parse import urlencode

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.deps import current_user, require_csrf
from app.models import Credential, Org, SigningKey, User, Verification
from app.services.permissions import require_org_role
from app.services.portable_credentials import (
    build_portable_credential,
    portable_credential_filename,
    public_credential_export_url,
    verification_method_url,
)
from app.services.signing import (
    build_credential_payload,
    ensure_active_signing_key,
    iso_z,
    random_public_slug,
    sign_payload,
    signing_key_to_jwk,
    verify_payload,
)
from app.services.wallets import locked_wallet, record_issue_charge

router = APIRouter(tags=["credentials"])


class CredentialIssue(BaseModel):
    org_id: uuid.UUID
    credential_name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4_000)
    recipient_name: str = Field(min_length=1, max_length=255)
    recipient_email: EmailStr
    recipient_linkedin_url: str | None = Field(default=None, max_length=1024)
    requirements: str | None = Field(default=None, max_length=4_000)
    skills: list[str] = Field(default_factory=list, max_length=25)
    expires_at: datetime | None = None
    image_url: str | None = Field(default=None, max_length=1024)
    design_json: dict[str, Any] = Field(default_factory=dict)
    template_id: uuid.UUID | None = None

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, value: list[str]) -> list[str]:
        return [skill.strip()[:80] for skill in value if skill.strip()]


class RevokeRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1_000)


class BatchRecipient(BaseModel):
    recipient_name: str = Field(min_length=1, max_length=255)
    recipient_email: EmailStr
    recipient_linkedin_url: str | None = Field(default=None, max_length=1024)


class CredentialBatchIssue(BaseModel):
    org_id: uuid.UUID
    credential_name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4_000)
    requirements: str | None = Field(default=None, max_length=4_000)
    skills: list[str] = Field(default_factory=list, max_length=25)
    expires_at: datetime | None = None
    image_url: str | None = Field(default=None, max_length=1024)
    design_json: dict[str, Any] = Field(default_factory=dict)
    template_id: uuid.UUID | None = None
    recipients: list[BatchRecipient] = Field(min_length=1, max_length=500)

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, value: list[str]) -> list[str]:
        return [skill.strip()[:80] for skill in value if skill.strip()]


def _public_url(slug: str) -> str:
    return f"{get_settings().public_url.rstrip('/')}/c/{slug}"


def _export_url(slug: str) -> str:
    base = get_settings().public_url.rstrip("/")
    return f"{base}/api/public/credentials/{slug}/export"


def _status(credential: Credential) -> str:
    now = datetime.now(UTC)
    if credential.revoked_at is not None:
        return "revoked"
    if credential.expires_at and credential.expires_at <= now:
        return "expired"
    return "active"


def _linkedin_url(credential: Credential, org: Org) -> str:
    params = {
        "startTask": "CERTIFICATION_NAME",
        "name": credential.credential_name,
        "organizationName": org.name,
        "issueYear": credential.issued_at.year,
        "issueMonth": credential.issued_at.month,
        "certUrl": _public_url(credential.public_slug),
        "certId": credential.public_slug,
    }
    if credential.expires_at:
        params["expirationYear"] = credential.expires_at.year
        params["expirationMonth"] = credential.expires_at.month
    return "https://www.linkedin.com/profile/add?" + urlencode(params)


def _credential_out(credential: Credential, org: Org) -> dict:
    return {
        "id": str(credential.id),
        "public_slug": credential.public_slug,
        "org_id": str(credential.org_id),
        "issuer_name": org.name,
        "credential_name": credential.credential_name,
        "description": credential.description,
        "recipient_name": credential.recipient_name,
        "recipient_email": credential.recipient_email,
        "recipient_linkedin_url": credential.recipient_linkedin_url,
        "requirements": credential.requirements,
        "skills": credential.skills or [],
        "image_url": credential.image_url,
        "issued_at": iso_z(credential.issued_at),
        "expires_at": iso_z(credential.expires_at),
        "revoked_at": iso_z(credential.revoked_at),
        "revoke_reason": credential.revoke_reason,
        "status": _status(credential),
        "public_url": _public_url(credential.public_slug),
        "export_url": public_credential_export_url(credential),
        "add_to_linkedin_url": _linkedin_url(credential, org),
    }


def _public_credential_out(credential: Credential, org: Org) -> dict:
    payload = build_credential_payload(credential, org)
    return {
        "slug": credential.public_slug,
        "credential_name": credential.credential_name,
        "description": credential.description,
        "recipient_name": credential.recipient_name,
        "issuer": {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "logo_url": org.logo_url,
            "website": org.website,
            "verified": org.verified,
        },
        "skills": credential.skills or [],
        "requirements": credential.requirements,
        "image_url": credential.image_url,
        "issued_at": iso_z(credential.issued_at),
        "expires_at": iso_z(credential.expires_at),
        "revoked_at": iso_z(credential.revoked_at),
        "revoke_reason": credential.revoke_reason,
        "status": _status(credential),
        "public_url": _public_url(credential.public_slug),
        "export_url": public_credential_export_url(credential),
        "qr_url": f"{_public_url(credential.public_slug)}/qr.png",
        "add_to_linkedin_url": _linkedin_url(credential, org),
        "signature": credential.signature,
        "signing_key_id": str(credential.signing_key_id),
        "canonical_payload": payload,
    }


def _unique_public_slug(db: DbSession) -> str:
    for _ in range(10):
        slug = random_public_slug()
        exists = db.execute(select(Credential.id).where(Credential.public_slug == slug)).first()
        if not exists:
            return slug
    raise RuntimeError("unable to generate unique credential slug")


def _credential_by_slug(db: DbSession, slug: str) -> Credential:
    credential = db.execute(
        select(Credential).where(Credential.public_slug == slug)
    ).scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="credential_not_found")
    return credential


def _portable_response(
    credential: Credential,
    org: Org,
    key: SigningKey,
    *,
    download: bool,
) -> JSONResponse:
    headers = {}
    if download:
        filename = portable_credential_filename(credential)
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return JSONResponse(
        build_portable_credential(credential, org, key, status=_status(credential)),
        media_type="application/ld+json",
        headers=headers,
    )


def _issue_one_credential(
    db: DbSession,
    *,
    org: Org,
    user: User,
    wallet,
    signing_key: SigningKey,
    price_cents: int,
    credential_name: str,
    description: str | None,
    recipient_name: str,
    recipient_email: str,
    recipient_linkedin_url: str | None,
    requirements: str | None,
    skills: list[str],
    expires_at: datetime | None,
    image_url: str | None,
    design_json: dict,
    template_id: uuid.UUID | None,
) -> Credential:
    """Issue a single credential within an existing transaction.

    Caller is responsible for locking the wallet, validating funds, and
    committing/rolling back the transaction. Does not commit by itself so it
    can be used inside a batch.
    """
    credential = Credential(
        id=uuid.uuid4(),
        public_slug=_unique_public_slug(db),
        org_id=org.id,
        issued_by_user_id=user.id,
        template_id=template_id,
        design_json=design_json,
        image_url=image_url,
        credential_name=credential_name,
        description=description,
        recipient_name=recipient_name,
        recipient_email=recipient_email.lower(),
        recipient_linkedin_url=recipient_linkedin_url,
        requirements=requirements,
        skills=skills,
        issued_at=datetime.now(UTC),
        expires_at=expires_at,
        signature="pending",
        signing_key_id=signing_key.id,
    )
    db.add(credential)
    db.flush()
    credential.signature = sign_payload(
        signing_key, build_credential_payload(credential, org)
    )
    record_issue_charge(
        db,
        wallet=wallet,
        credential_id=credential.id,
        amount_cents=price_cents,
    )
    return credential


@router.post(
    "/credentials",
    status_code=201,
    dependencies=[Depends(require_csrf)],
)
def issue_credential(
    body: CredentialIssue,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    org, _membership = require_org_role(db, user=user, org_id=body.org_id)
    wallet = locked_wallet(db, org.id)
    if wallet.balance_cents < settings.credential_price_cents:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "wallet.insufficient_funds",
                "message": "Recharge required to issue this credential.",
                "required_cents": settings.credential_price_cents,
                "balance_cents": wallet.balance_cents,
            },
        )

    signing_key = ensure_active_signing_key(db)
    credential = _issue_one_credential(
        db,
        org=org,
        user=user,
        wallet=wallet,
        signing_key=signing_key,
        price_cents=settings.credential_price_cents,
        credential_name=body.credential_name,
        description=body.description,
        recipient_name=body.recipient_name,
        recipient_email=str(body.recipient_email),
        recipient_linkedin_url=body.recipient_linkedin_url,
        requirements=body.requirements,
        skills=body.skills,
        expires_at=body.expires_at,
        image_url=body.image_url,
        design_json=body.design_json,
        template_id=body.template_id,
    )
    db.commit()
    db.refresh(credential)
    db.refresh(wallet)
    return {
        "credential": _credential_out(credential, org),
        "wallet_balance_cents": wallet.balance_cents,
    }


@router.post(
    "/credentials/batch",
    status_code=201,
    dependencies=[Depends(require_csrf)],
)
def issue_credentials_batch(
    body: CredentialBatchIssue,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    """Issue the same credential to many recipients in a single transaction.

    All-or-nothing semantics: if the wallet can't fund every credential, the
    request fails up-front with 402. Per-recipient validation errors (e.g.
    duplicate emails inside the same batch) are reported in the response
    rows so the caller can download a status CSV.
    """
    settings = get_settings()
    org, _membership = require_org_role(db, user=user, org_id=body.org_id)
    wallet = locked_wallet(db, org.id)
    price_cents = settings.credential_price_cents
    total_recipients = len(body.recipients)
    total_cost = price_cents * total_recipients

    if wallet.balance_cents < total_cost:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "wallet.insufficient_funds",
                "message": (
                    "Wallet balance is insufficient to issue the entire batch."
                ),
                "required_cents": total_cost,
                "balance_cents": wallet.balance_cents,
                "recipients": total_recipients,
                "price_cents_each": price_cents,
            },
        )

    signing_key = ensure_active_signing_key(db)
    results: list[dict] = []
    issued: list[Credential] = []
    seen_emails: set[str] = set()

    for index, recipient in enumerate(body.recipients):
        email_lower = str(recipient.recipient_email).lower()
        row_key = {
            "index": index,
            "recipient_name": recipient.recipient_name,
            "recipient_email": email_lower,
        }
        if email_lower in seen_emails:
            results.append({**row_key, "status": "skipped", "error": "duplicate_email_in_batch"})
            continue
        seen_emails.add(email_lower)
        try:
            credential = _issue_one_credential(
                db,
                org=org,
                user=user,
                wallet=wallet,
                signing_key=signing_key,
                price_cents=price_cents,
                credential_name=body.credential_name,
                description=body.description,
                recipient_name=recipient.recipient_name,
                recipient_email=email_lower,
                recipient_linkedin_url=recipient.recipient_linkedin_url,
                requirements=body.requirements,
                skills=body.skills,
                expires_at=body.expires_at,
                image_url=body.image_url,
                design_json=body.design_json,
                template_id=body.template_id,
            )
            issued.append(credential)
            results.append({
                **row_key,
                "status": "ok",
                "credential": _credential_out(credential, org),
            })
        except Exception as exc:  # pragma: no cover - defensive guard
            results.append({**row_key, "status": "error", "error": str(exc)})

    db.commit()
    db.refresh(wallet)
    return {
        "org_id": str(org.id),
        "total_requested": total_recipients,
        "issued_count": len(issued),
        "skipped_count": sum(1 for r in results if r["status"] != "ok"),
        "amount_charged_cents": price_cents * len(issued),
        "wallet_balance_cents": wallet.balance_cents,
        "results": results,
    }


@router.get("/credentials")
def list_credentials(
    org_id: uuid.UUID,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=120),
    status: str | None = Query(default=None, pattern="^(active|revoked|expired)$"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """List credentials for an org with filter + pagination.

    Returns an object with ``items``, ``total``, ``limit``, ``offset`` and
    ``has_more`` so the client can render correct totals and a Load-more
    button. (Previously returned a bare array capped at 50.)
    """
    org, _membership = require_org_role(db, user=user, org_id=org_id)
    base = select(Credential).where(Credential.org_id == org.id)
    if q:
        needle = f"%{q.strip()}%"
        base = base.where(
            or_(
                Credential.credential_name.ilike(needle),
                Credential.recipient_name.ilike(needle),
                Credential.recipient_email.ilike(needle),
            )
        )
    now = datetime.now(UTC)
    if status == "active":
        base = base.where(Credential.revoked_at.is_(None)).where(
            or_(Credential.expires_at.is_(None), Credential.expires_at > now)
        )
    elif status == "revoked":
        base = base.where(Credential.revoked_at.is_not(None))
    elif status == "expired":
        base = base.where(Credential.revoked_at.is_(None), Credential.expires_at <= now)

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    rows = db.execute(
        base.order_by(desc(Credential.issued_at)).offset(offset).limit(limit)
    ).scalars()
    items = [_credential_out(credential, org) for credential in rows]
    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(items) < int(total),
    }


@router.get("/credentials/{credential_id}")
def get_credential(
    credential_id: uuid.UUID,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    credential = db.get(Credential, credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="credential_not_found")
    org, _membership = require_org_role(db, user=user, org_id=credential.org_id)
    return _credential_out(credential, org)


@router.get("/credentials/{credential_id}/export")
def export_credential(
    credential_id: uuid.UUID,
    download: bool = Query(default=True),
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> JSONResponse:
    credential = db.get(Credential, credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="credential_not_found")
    org, _membership = require_org_role(db, user=user, org_id=credential.org_id)
    key = db.get(SigningKey, credential.signing_key_id)
    if not key:
        raise HTTPException(status_code=500, detail="signing_key_not_found")
    return _portable_response(credential, org, key, download=download)


@router.post(
    "/credentials/{credential_id}/revoke",
    dependencies=[Depends(require_csrf)],
)
def revoke_credential(
    credential_id: uuid.UUID,
    body: RevokeRequest,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    credential = db.get(Credential, credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="credential_not_found")
    org, _membership = require_org_role(db, user=user, org_id=credential.org_id)
    if credential.revoked_at is None:
        credential.revoked_at = datetime.now(UTC)
        credential.revoke_reason = body.reason
        db.commit()
        db.refresh(credential)
    return _credential_out(credential, org)


@router.get("/api/public/credentials/{slug}")
def public_credential(slug: str, db: DbSession = Depends(get_db)) -> dict:
    credential = _credential_by_slug(db, slug)
    org = db.get(Org, credential.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="issuer_not_found")
    return _public_credential_out(credential, org)


@router.get("/api/public/credentials/{slug}/export")
def export_public_credential(
    slug: str,
    download: bool = Query(default=True),
    db: DbSession = Depends(get_db),
) -> JSONResponse:
    credential = _credential_by_slug(db, slug)
    org = db.get(Org, credential.org_id)
    key = db.get(SigningKey, credential.signing_key_id)
    if not org:
        raise HTTPException(status_code=404, detail="issuer_not_found")
    if not key:
        raise HTTPException(status_code=500, detail="signing_key_not_found")
    return _portable_response(credential, org, key, download=download)


@router.get("/api/public/credentials/{slug}/verify")
def verify_public_credential(
    slug: str,
    request: Request,
    db: DbSession = Depends(get_db),
) -> dict:
    credential = db.execute(
        select(Credential).where(Credential.public_slug == slug)
    ).scalar_one_or_none()
    if not credential:
        db.add(
            Verification(
                id=uuid.uuid4(),
                credential_id=None,
                verifier_ip=request.client.host if request.client else None,
                verifier_ua=request.headers.get("user-agent"),
                result="not_found",
            )
        )
        db.commit()
        raise HTTPException(status_code=404, detail="credential_not_found")

    org = db.get(Org, credential.org_id)
    key = db.get(SigningKey, credential.signing_key_id)
    signature_valid = bool(org and key) and verify_payload(
        key, build_credential_payload(credential, org), credential.signature
    )
    status = _status(credential)
    result = "valid"
    if not signature_valid:
        result = "signature_invalid"
    elif status == "revoked":
        result = "revoked"
    elif status == "expired":
        result = "expired"

    db.add(
        Verification(
            id=uuid.uuid4(),
            credential_id=credential.id,
            verifier_ip=request.client.host if request.client else None,
            verifier_ua=request.headers.get("user-agent"),
            result=result,
        )
    )
    db.commit()
    return {
        "valid": result == "valid",
        "signature_valid": signature_valid,
        "revoked": status == "revoked",
        "expired": status == "expired",
        "signed_at": iso_z(credential.issued_at),
        "issuer_verified": org.verified if org else False,
        "key_id": str(key.id) if key else None,
        "result": result,
    }


@router.get("/c/{slug}/qr.png")
def credential_qr(slug: str, db: DbSession = Depends(get_db)) -> StreamingResponse:
    credential = db.execute(
        select(Credential).where(Credential.public_slug == slug)
    ).scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="credential_not_found")
    img = qrcode.make(_public_url(slug))
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@router.get("/c/{slug}", response_class=HTMLResponse)
def credential_public_page(
    slug: str,
    format: str | None = Query(default=None),
    db: DbSession = Depends(get_db),
) -> Response:
    if format == "ob3":
        credential = _credential_by_slug(db, slug)
        org = db.get(Org, credential.org_id)
        key = db.get(SigningKey, credential.signing_key_id)
        if not org:
            raise HTTPException(status_code=404, detail="issuer_not_found")
        if not key:
            raise HTTPException(status_code=500, detail="signing_key_not_found")
        return _portable_response(credential, org, key, download=False)

    credential = _credential_by_slug(db, slug)
    org = db.get(Org, credential.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="issuer_not_found")

    data = _public_credential_out(credential, org)
    title = f"{credential.credential_name} - {credential.recipient_name}"
    description = credential.description or f"Issued by {org.name}"
    image_url = credential.image_url or org.logo_url or ""
    esc = html.escape
    skills = "".join(f"<li>{esc(skill)}</li>" for skill in (credential.skills or []))
    og_image_meta = (
        f'<meta property="og:image" content="{esc(image_url)}">' if image_url else ""
    )
    badge_markup = (
        f'<img src="{esc(credential.image_url)}" alt="">'
        if credential.image_url
        else esc(credential.credential_name)
    )
    skills_section = (
        f"<section><h2>Skills</h2><ul>{skills}</ul></section>" if skills else ""
    )
    verify_url = (
        f"{get_settings().public_url.rstrip('/')}/api/public/credentials/{esc(slug)}/verify"
    )
    html_body = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="{esc(data["public_url"])}">
  {og_image_meta}
  <style>
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system,
        BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }}
    main {{
      width: min(760px, calc(100% - 32px));
      margin: 48px auto;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }}
    .hero {{
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 28px;
      padding: 32px;
      border-bottom: 1px solid #e2e8f0;
    }}
    .badge {{
      aspect-ratio: 1;
      border-radius: 50%;
      background: #e0f2fe;
      display: grid;
      place-items: center;
      overflow: hidden;
      font-weight: 800;
      color: #0369a1;
      text-align: center;
      padding: 18px;
    }}
    .badge img {{ width: 100%; height: 100%; object-fit: cover; }}
    h1 {{ margin: 0; font-size: clamp(1.8rem, 4vw, 2.7rem); line-height: 1; }}
    p {{ color: #475569; line-height: 1.6; }}
    dl, section {{ padding: 0 32px 28px; }}
    dt {{ color: #64748b; font-size: 0.78rem; text-transform: uppercase; }}
    dd {{ margin: 4px 0 18px; font-weight: 650; }}
    ul {{ display: flex; flex-wrap: wrap; gap: 8px; padding: 0; list-style: none; }}
    li {{
      border: 1px solid #bae6fd;
      color: #075985;
      border-radius: 999px;
      padding: 5px 10px;
    }}
    .actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 0 32px 32px;
    }}
    a.button {{
      background: #0284c7;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      padding: 10px 14px;
      font-weight: 700;
    }}
    a.secondary {{
      background: white;
      color: #0f172a;
      border: 1px solid #cbd5e1;
    }}
    @media (max-width: 640px) {{
      .hero {{ grid-template-columns: 1fr; }}
      .badge {{ width: 160px; }}
    }}
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <div class="badge">{badge_markup}</div>
      <div>
        <h1>{esc(credential.credential_name)}</h1>
        <p>{esc(description)}</p>
      </div>
    </div>
    <dl>
      <dt>Issued to</dt><dd>{esc(credential.recipient_name)}</dd>
      <dt>Issued by</dt><dd>{esc(org.name)}</dd>
      <dt>Issued on</dt><dd>{esc(iso_z(credential.issued_at) or "")}</dd>
      <dt>Status</dt><dd>{esc(data["status"])}</dd>
    </dl>
    {skills_section}
    <div class="actions">
      <a class="button" href="{esc(data["add_to_linkedin_url"])}">Add to LinkedIn</a>
      <a class="button secondary" href="{esc(data["public_url"])}/qr.png">QR code</a>
      <a class="button secondary" href="{verify_url}">Verify</a>
      <a class="button secondary" href="{esc(_export_url(slug))}">Download VC JSON</a>
    </div>
  </main>
</body>
</html>"""
    return HTMLResponse(html_body)


@router.get("/.well-known/jwks.json")
def jwks(db: DbSession = Depends(get_db)) -> dict:
    keys = db.execute(
        select(SigningKey).where(
            SigningKey.algorithm == "Ed25519",
            or_(SigningKey.active.is_(True), SigningKey.retired_at.is_not(None)),
        )
    ).scalars()
    return {"keys": [signing_key_to_jwk(key) for key in keys]}


@router.get("/issuers/{org_id}")
def issuer_profile(org_id: uuid.UUID, db: DbSession = Depends(get_db)) -> dict:
    org = db.get(Org, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="issuer_not_found")
    count = db.execute(
        select(func.count()).select_from(Credential).where(Credential.org_id == org.id)
    ).scalar_one()
    keys = db.execute(
        select(SigningKey).where(
            SigningKey.algorithm == "Ed25519",
            or_(SigningKey.active.is_(True), SigningKey.retired_at.is_not(None)),
        )
    ).scalars()
    verification_methods = [
        {
            "id": verification_method_url(org, key),
            "type": "JsonWebKey2020",
            "controller": f"{get_settings().public_url.rstrip('/')}/issuers/{org.id}",
            "publicKeyJwk": signing_key_to_jwk(key),
        }
        for key in keys
    ]
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "website": org.website,
        "logo_url": org.logo_url,
        "verified": org.verified,
        "issued_credentials_count": count,
        "verificationMethod": verification_methods,
        "assertionMethod": [method["id"] for method in verification_methods],
    }
