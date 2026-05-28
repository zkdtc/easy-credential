"""End-to-end tests for POST /credentials/batch."""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture(autouse=True)
def _sqlite_compat():
    from sqlalchemy.ext.compiler import compiles
    from sqlalchemy.types import JSON

    @compiles(JSONB, "sqlite")
    def _jsonb_sqlite(type_, compiler, **kw):
        return compiler.visit_JSON(JSON(), **kw)

    @compiles(UUID, "sqlite")
    def _uuid_sqlite(type_, compiler, **kw):
        return "CHAR(36)"

    yield


@pytest.fixture()
def setup():
    """Spin up app with in-memory DB and seeded org+user+wallet+signing key."""
    from app.db import get_db
    from app.deps import current_user, require_csrf
    from app.main import create_app
    from app.models import Org, OrgMember, User, Wallet
    from app.models.auth import Base as AuthBase
    from app.models.wallet import Base as WalletBase
    from app.models.credential import Base as CredentialBase, SigningKey
    from app.services import signing as signing_module

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    AuthBase.metadata.create_all(engine)
    WalletBase.metadata.create_all(engine)
    CredentialBase.metadata.create_all(engine)
    SL = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    # Seed org, user, wallet, signing key
    with SL() as db:
        org = Org(id=uuid.uuid4(), name="Test Org", slug=f"t-{uuid.uuid4().hex[:8]}")
        user = User(
            id=uuid.uuid4(),
            email="issuer@example.com",
            default_org_id=org.id,
            auth_provider="google",
            provider_subject=f"sub-{uuid.uuid4().hex[:8]}",
        )
        member = OrgMember(org_id=org.id, user_id=user.id, role="owner")
        wallet = Wallet(
            id=uuid.uuid4(),
            org_id=org.id,
            balance_cents=10_000,  # $100 → enough for ~25 credentials @ $3.99
            currency="USD",
        )
        # Create a signing key so issuance can sign payloads
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey,
        )
        from cryptography.hazmat.primitives import serialization

        priv = Ed25519PrivateKey.generate()
        priv_pem = priv.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        pub_pem = (
            priv.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode()
        )
        signing_key = SigningKey(
            id=uuid.uuid4(),
            public_key=pub_pem,
            private_key_pem=priv_pem,
            algorithm="Ed25519",
            active=True,
        )
        db.add_all([org, user, member, wallet, signing_key])
        db.commit()
        org_id, user_id = org.id, user.id

    app = create_app()

    def _override_db():
        db = SL()
        try:
            yield db
        finally:
            db.close()

    def _override_user():
        # Return the seeded user freshly attached to a new session each call
        db = SL()
        try:
            from sqlalchemy import select

            return db.execute(select(User).where(User.id == user_id)).scalar_one()
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[current_user] = _override_user
    app.dependency_overrides[require_csrf] = lambda: None

    with TestClient(app) as client:
        yield {
            "client": client,
            "org_id": str(org_id),
            "session_local": SL,
        }
    app.dependency_overrides.clear()


def _body(org_id: str, recipients: list[dict], **overrides) -> dict:
    base = {
        "org_id": org_id,
        "credential_name": "Cloud Foundations Certified",
        "description": "Awarded for completing the course.",
        "skills": ["cloud", "kubernetes"],
        "recipients": recipients,
    }
    base.update(overrides)
    return base


def test_batch_issues_all_recipients(setup) -> None:
    client, org_id = setup["client"], setup["org_id"]
    resp = client.post(
        "/credentials/batch",
        json=_body(
            org_id,
            recipients=[
                {"recipient_name": "Alice", "recipient_email": "alice@example.com"},
                {"recipient_name": "Bob", "recipient_email": "bob@example.com"},
                {"recipient_name": "Carol", "recipient_email": "carol@example.com"},
            ],
        ),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_requested"] == 3
    assert body["issued_count"] == 3
    assert body["skipped_count"] == 0
    assert body["amount_charged_cents"] == 3 * 399
    assert body["wallet_balance_cents"] == 10_000 - 3 * 399
    assert all(r["status"] == "ok" for r in body["results"])
    # Each result includes a credential with a public slug + URL
    slugs = {r["credential"]["public_slug"] for r in body["results"]}
    assert len(slugs) == 3  # unique slugs
    for r in body["results"]:
        assert r["credential"]["public_url"].endswith(
            "/c/" + r["credential"]["public_slug"]
        )


def test_batch_dedupes_duplicate_emails(setup) -> None:
    client, org_id = setup["client"], setup["org_id"]
    resp = client.post(
        "/credentials/batch",
        json=_body(
            org_id,
            recipients=[
                {"recipient_name": "Alice", "recipient_email": "alice@example.com"},
                {"recipient_name": "Alice (dup)", "recipient_email": "ALICE@example.com"},
                {"recipient_name": "Bob", "recipient_email": "bob@example.com"},
            ],
        ),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["issued_count"] == 2
    assert body["skipped_count"] == 1
    skipped = [r for r in body["results"] if r["status"] == "skipped"]
    assert len(skipped) == 1
    assert skipped[0]["error"] == "duplicate_email_in_batch"


def test_batch_rejects_when_wallet_insufficient(setup) -> None:
    """Wallet has $100 = 10,000 cents → only fits 25 credentials at $3.99 each.

    Request 50 → must be rejected up-front with 402 (no partial charge).
    """
    client, org_id = setup["client"], setup["org_id"]
    many = [
        {"recipient_name": f"User {i}", "recipient_email": f"u{i}@example.com"}
        for i in range(50)
    ]
    resp = client.post("/credentials/batch", json=_body(org_id, many))
    assert resp.status_code == 402, resp.text
    detail = resp.json()["detail"]
    assert detail["code"] == "wallet.insufficient_funds"
    assert detail["recipients"] == 50
    assert detail["required_cents"] == 50 * 399
    assert detail["balance_cents"] == 10_000
    # No credentials should have been issued (atomic check)
    with setup["session_local"]() as db:
        from app.models import Credential
        from sqlalchemy import select, func

        count = db.execute(select(func.count(Credential.id))).scalar()
        assert count == 0


def test_batch_validation_min_recipients(setup) -> None:
    client, org_id = setup["client"], setup["org_id"]
    resp = client.post("/credentials/batch", json=_body(org_id, recipients=[]))
    assert resp.status_code == 422


def test_batch_validation_max_recipients(setup) -> None:
    client, org_id = setup["client"], setup["org_id"]
    too_many = [
        {"recipient_name": f"U{i}", "recipient_email": f"u{i}@x.com"}
        for i in range(501)
    ]
    resp = client.post("/credentials/batch", json=_body(org_id, too_many))
    assert resp.status_code == 422


def test_batch_validation_bad_email(setup) -> None:
    client, org_id = setup["client"], setup["org_id"]
    resp = client.post(
        "/credentials/batch",
        json=_body(
            org_id,
            recipients=[
                {"recipient_name": "Alice", "recipient_email": "not-an-email"},
            ],
        ),
    )
    assert resp.status_code == 422
