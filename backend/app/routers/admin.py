"""Admin routes — protected by a static secret key (X-Admin-Key header).

These endpoints are intended for internal/ops use only and should never be
exposed publicly without additional network-level protection.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.models import OrgMember, User
from app.services.wallets import ensure_wallet, record_recharge

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin_key(x_admin_key: str = Header(..., alias="X-Admin-Key")) -> None:
    settings = get_settings()
    if not settings.admin_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin_not_configured",
        )
    if x_admin_key != settings.admin_secret_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_admin_key",
        )


class CreditRequest(BaseModel):
    email: EmailStr
    amount_cents: int  # e.g. 1_000_000 = $10,000 worth of credits
    note: str = "manual admin credit"


@router.post("/wallets/credit", dependencies=[Depends(_require_admin_key)])
def admin_credit_wallet(body: CreditRequest, db: DbSession = Depends(get_db)) -> dict:
    """Credit a wallet by user email.

    Looks up the user → their default org → credits that org's wallet.
    Requires the `X-Admin-Key` header to match `ADMIN_SECRET_KEY` in config.
    """
    if body.amount_cents <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="amount_cents must be positive",
        )

    # Resolve user
    user = db.execute(
        select(User).where(User.email == str(body.email).lower())
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    # Resolve org — use default_org_id, fall back to first membership
    org_id: uuid.UUID | None = user.default_org_id
    if not org_id:
        membership = db.execute(
            select(OrgMember).where(OrgMember.user_id == user.id)
        ).scalar_one_or_none()
        if membership:
            org_id = membership.org_id

    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="org_not_found")

    # Ensure wallet exists and credit it
    wallet, bonus_cents, bonus_bps = record_recharge(
        db,
        org_id=org_id,
        amount_cents=body.amount_cents,
        note=body.note,
    )
    db.commit()
    db.refresh(wallet)

    return {
        "ok": True,
        "email": str(body.email),
        "org_id": str(org_id),
        "wallet_id": str(wallet.id),
        "credited_cents": body.amount_cents,
        "bonus_cents": bonus_cents,
        "new_balance_cents": wallet.balance_cents,
    }
