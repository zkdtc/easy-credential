"""Pricing preview endpoint.

Mirrors the locked recharge bonus tiers documented in docs/pricing.md so the
frontend can show a live "you'll get $X credit" preview as the user types.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.services.pricing import compute_bonus_cents

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.get("/recharge-preview")
def recharge_preview(
    amount_cents: int = Query(..., ge=0, le=10_000_000),
) -> dict:
    bonus_cents, bonus_bps = compute_bonus_cents(amount_cents)
    total_credit = amount_cents + bonus_cents
    per_credential_cents = get_settings().credential_price_cents
    effective_cents = (
        per_credential_cents * 10_000 // (10_000 + bonus_bps) if bonus_bps else per_credential_cents
    )
    if amount_cents == 0:
        raise HTTPException(status_code=400, detail="amount_cents must be > 0")
    return {
        "amount_cents": amount_cents,
        "bonus_cents": bonus_cents,
        "bonus_bps": bonus_bps,
        "total_credit_cents": total_credit,
        "credentials_available": total_credit // per_credential_cents,
        "effective_per_credential_cents": effective_cents,
    }
