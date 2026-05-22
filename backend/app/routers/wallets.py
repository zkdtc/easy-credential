"""Wallet balance, ledger, recharge, and Stripe webhook routes."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.db import get_db
from app.deps import current_user, require_csrf
from app.models import User, WalletTransaction
from app.services.permissions import require_org_role
from app.services.pricing import compute_bonus_cents
from app.services.wallets import ensure_wallet, record_recharge

router = APIRouter(tags=["wallet"])


PLACEHOLDER_STRIPE_KEYS = {"sk_test_xxx", "sk_live_xxx"}


class RechargeRequest(BaseModel):
    amount_cents: int = Field(ge=1_000, le=10_000_000)


def _wallet_out(wallet) -> dict:
    return {
        "id": str(wallet.id),
        "org_id": str(wallet.org_id),
        "balance_cents": wallet.balance_cents,
        "currency": wallet.currency,
        "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
    }


def _transaction_out(tx: WalletTransaction) -> dict:
    return {
        "id": str(tx.id),
        "wallet_id": str(tx.wallet_id),
        "type": tx.type,
        "amount_cents": tx.amount_cents,
        "balance_after_cents": tx.balance_after_cents,
        "credential_id": str(tx.credential_id) if tx.credential_id else None,
        "note": tx.note,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
    }


def _stripe_configured(secret_key: str) -> bool:
    return bool(secret_key and secret_key not in PLACEHOLDER_STRIPE_KEYS)


@router.get("/orgs/{org_id}/wallet")
def get_wallet(
    org_id: uuid.UUID,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    org, _membership = require_org_role(db, user=user, org_id=org_id)
    wallet = ensure_wallet(db, org.id)
    db.commit()
    db.refresh(wallet)
    return _wallet_out(wallet)


@router.get("/orgs/{org_id}/wallet/transactions")
def list_transactions(
    org_id: uuid.UUID,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
) -> list[dict]:
    org, _membership = require_org_role(db, user=user, org_id=org_id)
    wallet = ensure_wallet(db, org.id)
    rows = db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(desc(WalletTransaction.created_at))
        .limit(limit)
    ).scalars()
    return [_transaction_out(tx) for tx in rows]


@router.post(
    "/orgs/{org_id}/wallet/recharge",
    status_code=201,
    dependencies=[Depends(require_csrf)],
)
def create_recharge(
    org_id: uuid.UUID,
    body: RechargeRequest,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    org, _membership = require_org_role(
        db, user=user, org_id=org_id, allowed_roles=("owner", "admin")
    )
    wallet = ensure_wallet(db, org.id)

    bonus_cents, bonus_bps = compute_bonus_cents(body.amount_cents)
    if not _stripe_configured(settings.stripe_secret_key):
        wallet, bonus_cents, bonus_bps = record_recharge(
            db,
            org_id=org.id,
            amount_cents=body.amount_cents,
            note="development recharge",
        )
        db.commit()
        db.refresh(wallet)
        return {
            "mode": "development_credit",
            "wallet": _wallet_out(wallet),
            "amount_cents": body.amount_cents,
            "bonus_cents": bonus_cents,
            "bonus_bps": bonus_bps,
        }

    import stripe

    stripe.api_key = settings.stripe_secret_key
    intent = stripe.PaymentIntent.create(
        amount=body.amount_cents,
        currency="usd",
        automatic_payment_methods={"enabled": True},
        metadata={
            "org_id": str(org.id),
            "wallet_id": str(wallet.id),
            "base_amount_cents": str(body.amount_cents),
        },
    )
    db.commit()
    return {
        "mode": "stripe_payment_intent",
        "client_secret": intent.client_secret,
        "amount_cents": body.amount_cents,
        "bonus_cents": bonus_cents,
        "bonus_bps": bonus_bps,
    }


@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    db: DbSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="stripe_webhook_not_configured")

    import stripe

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.stripe_webhook_secret,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid_payload") from exc
    except stripe.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="invalid_signature") from exc

    if event["type"] != "payment_intent.succeeded":
        return {"ok": True, "ignored": event["type"]}

    intent = event["data"]["object"]
    already_recorded = db.execute(
        select(WalletTransaction.id).where(
            WalletTransaction.stripe_payment_intent_id == intent["id"]
        )
    ).first()
    if already_recorded:
        return {"ok": True, "duplicate": True}

    metadata = intent.get("metadata") or {}
    try:
        org_id = uuid.UUID(metadata["org_id"])
        amount_cents = int(metadata["base_amount_cents"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="missing_wallet_metadata") from exc

    record_recharge(
        db,
        org_id=org_id,
        amount_cents=amount_cents,
        stripe_payment_intent_id=intent["id"],
        note="stripe payment_intent.succeeded",
    )
    db.commit()
    return {"ok": True}
