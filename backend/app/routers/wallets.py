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
from app.models import User, Wallet, WalletTransaction
from app.services.permissions import require_org_role
from app.services.pricing import compute_bonus_cents
from app.services.wallets import (
    ensure_wallet,
    find_transaction_by_payment_intent,
    record_recharge,
    record_stripe_payment_intent_recharge,
)

router = APIRouter(tags=["wallet"])


PLACEHOLDER_STRIPE_SECRET_KEYS = {"sk_test_xxx", "sk_live_xxx"}
PLACEHOLDER_STRIPE_PUBLISHABLE_KEYS = {"pk_test_xxx", "pk_live_xxx"}


class RechargeRequest(BaseModel):
    amount_cents: int = Field(ge=100, le=10_000_000)


class RechargeSyncRequest(BaseModel):
    payment_intent_id: str = Field(min_length=1, max_length=255)


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
        "stripe_payment_intent_id": tx.stripe_payment_intent_id,
        "credential_id": str(tx.credential_id) if tx.credential_id else None,
        "note": tx.note,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
    }


def _stripe_configured(secret_key: str) -> bool:
    return bool(secret_key and secret_key not in PLACEHOLDER_STRIPE_SECRET_KEYS)


def _stripe_publishable_configured(publishable_key: str) -> bool:
    return bool(
        publishable_key
        and publishable_key not in PLACEHOLDER_STRIPE_PUBLISHABLE_KEYS
    )


def _stripe_enabled() -> bool:
    settings = get_settings()
    return _stripe_configured(
        settings.stripe_secret_key
    ) and _stripe_publishable_configured(settings.stripe_publishable_key)


@router.get("/stripe/config")
def stripe_config(_user: User = Depends(current_user)) -> dict:
    settings = get_settings()
    enabled = _stripe_enabled()
    return {
        "enabled": enabled,
        "publishable_key": settings.stripe_publishable_key if enabled else None,
    }


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
    if not _stripe_enabled():
        if settings.env.lower() == "production":
            raise HTTPException(status_code=503, detail="stripe_not_configured")
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
            "bonus_cents": str(bonus_cents),
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


@router.post(
    "/orgs/{org_id}/wallet/recharge/sync",
    dependencies=[Depends(require_csrf)],
)
def sync_recharge(
    org_id: uuid.UUID,
    body: RechargeSyncRequest,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    org, _membership = require_org_role(
        db, user=user, org_id=org_id, allowed_roles=("owner", "admin")
    )
    if not _stripe_enabled():
        raise HTTPException(status_code=400, detail="stripe_not_configured")

    existing = find_transaction_by_payment_intent(db, body.payment_intent_id)
    if existing:
        wallet = db.get(Wallet, existing.wallet_id)
        return {
            "ok": True,
            "credited": False,
            "wallet": _wallet_out(wallet) if wallet else None,
        }

    import stripe

    stripe.api_key = settings.stripe_secret_key
    try:
        intent = stripe.PaymentIntent.retrieve(body.payment_intent_id)
    except stripe.error.StripeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"stripe_retrieve_failed: {getattr(exc, 'user_message', None) or str(exc)}",
        ) from exc

    metadata = intent.get("metadata") or {}
    # If metadata.org_id is missing, the PaymentIntent was likely created on a
    # different Stripe account or test/live mode mismatch — surface clearly.
    if not metadata.get("org_id"):
        raise HTTPException(
            status_code=409,
            detail="payment_intent_missing_metadata: org_id absent (check Stripe key mode and metadata)",
        )
    if metadata.get("org_id") != str(org.id):
        raise HTTPException(status_code=403, detail="payment_intent_forbidden")

    try:
        wallet, created = record_stripe_payment_intent_recharge(
            db,
            payment_intent=dict(intent),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not wallet:
        return {
            "ok": True,
            "credited": False,
            "status": intent.get("status"),
            "wallet": _wallet_out(ensure_wallet(db, org.id)),
        }
    db.commit()
    db.refresh(wallet)
    return {
        "ok": True,
        "credited": created,
        "status": intent.get("status"),
        "wallet": _wallet_out(wallet),
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

    intent = dict(event["data"]["object"])
    if find_transaction_by_payment_intent(db, intent["id"]):
        return {"ok": True, "duplicate": True}

    try:
        wallet, created = record_stripe_payment_intent_recharge(
            db,
            payment_intent=intent,
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="missing_wallet_metadata") from exc
    if not wallet or not created:
        return {"ok": True, "credited": False}
    db.commit()
    return {"ok": True, "credited": True}
