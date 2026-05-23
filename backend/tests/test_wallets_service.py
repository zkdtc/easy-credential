"""Tests for the wallet service Stripe payment-intent recharge logic.

Covers the hardened metadata handling we added so payment_intent.succeeded
events with missing/malformed metadata raise readable errors instead of 500s.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Session
from sqlalchemy.types import JSON

from app.services.wallets import (
    find_transaction_by_payment_intent,
    record_stripe_payment_intent_recharge,
)


# --- SQLite compatibility shims for Postgres-only types ---------------------
# The Org table uses JSONB and UUID columns which SQLite doesn't natively
# support. We swap them at compile time so we can run the wallet logic in an
# in-memory SQLite DB.
@pytest.fixture(autouse=True)
def _sqlite_compat():
    from sqlalchemy.ext.compiler import compiles

    @compiles(JSONB, "sqlite")
    def _jsonb_sqlite(type_, compiler, **kw):
        return compiler.visit_JSON(JSON(), **kw)

    @compiles(UUID, "sqlite")
    def _uuid_sqlite(type_, compiler, **kw):
        return "CHAR(36)"

    yield


@pytest.fixture()
def db() -> Session:
    # Import inside the fixture so the compat shims are registered first.
    from app.models.auth import Base as AuthBase
    from app.models.wallet import Base as WalletBase

    engine = create_engine("sqlite:///:memory:")
    AuthBase.metadata.create_all(engine)
    WalletBase.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture()
def org_id(db: Session) -> uuid.UUID:
    from app.models import Org

    org = Org(id=uuid.uuid4(), name="Test Org", slug=f"test-{uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    return org.id


def _intent(
    *,
    intent_id: str = "pi_test_1",
    status: str = "succeeded",
    amount: int = 1000,
    metadata: dict | None = None,
) -> dict:
    intent: dict = {"id": intent_id, "status": status, "amount": amount}
    if metadata is not None:
        intent["metadata"] = metadata
    return intent


def test_credits_wallet_on_success(db: Session, org_id: uuid.UUID) -> None:
    wallet, created = record_stripe_payment_intent_recharge(
        db,
        payment_intent=_intent(
            metadata={"org_id": str(org_id), "base_amount_cents": "1000"},
        ),
    )
    assert created is True
    assert wallet is not None
    assert wallet.balance_cents == 1000
    tx = find_transaction_by_payment_intent(db, "pi_test_1")
    assert tx is not None
    assert tx.amount_cents == 1000


def test_falls_back_to_amount_when_base_amount_missing(
    db: Session, org_id: uuid.UUID
) -> None:
    """If only `amount` is on the PaymentIntent, use it as the recharge value."""
    wallet, created = record_stripe_payment_intent_recharge(
        db,
        payment_intent=_intent(
            amount=2500,
            metadata={"org_id": str(org_id)},  # no base_amount_cents
        ),
    )
    assert created is True
    assert wallet.balance_cents == 2500


def test_idempotent_on_duplicate(db: Session, org_id: uuid.UUID) -> None:
    intent = _intent(metadata={"org_id": str(org_id), "base_amount_cents": "500"})
    wallet1, created1 = record_stripe_payment_intent_recharge(db, payment_intent=intent)
    wallet2, created2 = record_stripe_payment_intent_recharge(db, payment_intent=intent)
    assert created1 is True
    assert created2 is False
    assert wallet1.id == wallet2.id
    assert wallet2.balance_cents == 500  # not double-credited


def test_skips_non_succeeded(db: Session, org_id: uuid.UUID) -> None:
    wallet, created = record_stripe_payment_intent_recharge(
        db,
        payment_intent=_intent(
            status="requires_payment_method",
            metadata={"org_id": str(org_id), "base_amount_cents": "500"},
        ),
    )
    assert wallet is None
    assert created is False


def test_raises_on_missing_org_id(db: Session) -> None:
    with pytest.raises(ValueError, match="missing_metadata_org_id"):
        record_stripe_payment_intent_recharge(
            db,
            payment_intent=_intent(metadata={"base_amount_cents": "500"}),
        )


def test_raises_on_missing_metadata_entirely(db: Session) -> None:
    with pytest.raises(ValueError, match="missing_metadata_org_id"):
        record_stripe_payment_intent_recharge(
            db,
            payment_intent=_intent(metadata=None),
        )


def test_raises_on_invalid_org_id(db: Session) -> None:
    with pytest.raises(ValueError, match="invalid_metadata_org_id"):
        record_stripe_payment_intent_recharge(
            db,
            payment_intent=_intent(
                metadata={"org_id": "not-a-uuid", "base_amount_cents": "500"},
            ),
        )


def test_raises_on_invalid_base_amount(db: Session, org_id: uuid.UUID) -> None:
    with pytest.raises(ValueError, match="invalid_metadata_base_amount_cents"):
        record_stripe_payment_intent_recharge(
            db,
            payment_intent=_intent(
                metadata={"org_id": str(org_id), "base_amount_cents": "abc"},
            ),
        )


def test_raises_when_amount_is_zero_and_no_metadata_amount(
    db: Session, org_id: uuid.UUID
) -> None:
    with pytest.raises(ValueError, match="invalid_amount"):
        record_stripe_payment_intent_recharge(
            db,
            payment_intent=_intent(amount=0, metadata={"org_id": str(org_id)}),
        )
