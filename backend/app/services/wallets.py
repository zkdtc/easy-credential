"""Wallet ledger operations."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Wallet, WalletTransaction
from app.services.pricing import compute_bonus_cents


def ensure_wallet(db: DbSession, org_id: uuid.UUID) -> Wallet:
    """Return an org wallet, creating it if this is the first access."""
    wallet = db.execute(select(Wallet).where(Wallet.org_id == org_id)).scalar_one_or_none()
    if wallet:
        return wallet
    wallet = Wallet(id=uuid.uuid4(), org_id=org_id, balance_cents=0, currency="USD")
    db.add(wallet)
    db.flush()
    return wallet


def locked_wallet(db: DbSession, org_id: uuid.UUID) -> Wallet:
    """Fetch a wallet row under a transaction lock when the DB supports it."""
    wallet = db.execute(
        select(Wallet).where(Wallet.org_id == org_id).with_for_update()
    ).scalar_one_or_none()
    if wallet:
        return wallet
    return ensure_wallet(db, org_id)


def record_recharge(
    db: DbSession,
    *,
    org_id: uuid.UUID,
    amount_cents: int,
    stripe_payment_intent_id: str | None = None,
    note: str | None = None,
) -> tuple[Wallet, int, int]:
    """Credit a wallet with base recharge plus any tier bonus.

    Returns `(wallet, bonus_cents, bonus_bps)`. Callers own commit/rollback.
    """
    wallet = locked_wallet(db, org_id)
    bonus_cents, bonus_bps = compute_bonus_cents(amount_cents)

    wallet.balance_cents += amount_cents
    db.add(
        WalletTransaction(
            id=uuid.uuid4(),
            wallet_id=wallet.id,
            type="recharge",
            amount_cents=amount_cents,
            balance_after_cents=wallet.balance_cents,
            stripe_payment_intent_id=stripe_payment_intent_id,
            note=note,
        )
    )

    if bonus_cents:
        wallet.balance_cents += bonus_cents
        db.add(
            WalletTransaction(
                id=uuid.uuid4(),
                wallet_id=wallet.id,
                type="bonus",
                amount_cents=bonus_cents,
                balance_after_cents=wallet.balance_cents,
                note=f"tier bonus {bonus_bps // 100}%",
            )
        )

    db.flush()
    return wallet, bonus_cents, bonus_bps


def record_issue_charge(
    db: DbSession,
    *,
    wallet: Wallet,
    credential_id: uuid.UUID,
    amount_cents: int,
) -> WalletTransaction:
    """Append the issue charge to the ledger and deduct from the wallet."""
    wallet.balance_cents -= amount_cents
    tx = WalletTransaction(
        id=uuid.uuid4(),
        wallet_id=wallet.id,
        type="issue_charge",
        amount_cents=-amount_cents,
        balance_after_cents=wallet.balance_cents,
        credential_id=credential_id,
        note="credential issuance",
    )
    db.add(tx)
    db.flush()
    return tx
