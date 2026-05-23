"""End-to-end tests for the /admin/wallets/credit endpoint.

Uses FastAPI's TestClient with the production app, overriding the database
dependency to point at an in-memory SQLite database and stubbing out
get_settings() to inject a known ADMIN_SECRET_KEY.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings


# --- SQLite compat shims for Postgres-only types ----------------------------
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
def client(monkeypatch):
    """Spin up the FastAPI app with an in-memory DB and a known admin key."""
    # Patch settings so the admin endpoint accepts our test secret.
    from app import config as config_module

    def _test_settings() -> Settings:
        return Settings(admin_secret_key="test-admin-secret")  # type: ignore[call-arg]

    monkeypatch.setattr(config_module, "get_settings", _test_settings)

    # Ensure modules that imported get_settings re-resolve through the patched one.
    from app.routers import admin as admin_router
    monkeypatch.setattr(admin_router, "get_settings", _test_settings)

    # Build in-memory DB and override the get_db dependency.
    from app.db import get_db
    from app.models.auth import Base as AuthBase
    from app.models.wallet import Base as WalletBase

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    AuthBase.metadata.create_all(engine)
    WalletBase.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    with TestClient(app) as c:
        # Attach the session factory so individual tests can seed data.
        c.SessionLocal = TestingSessionLocal  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()


def _seed_user_and_org(
    session_local: sessionmaker,
    *,
    email: str = "test@example.com",
) -> tuple[uuid.UUID, uuid.UUID]:
    from app.models import Org, OrgMember, User

    with session_local() as db:
        org = Org(id=uuid.uuid4(), name="Test Org", slug=f"t-{uuid.uuid4().hex[:8]}")
        user = User(
            id=uuid.uuid4(),
            email=email,
            default_org_id=org.id,
            auth_provider="google",
            provider_subject=f"sub-{uuid.uuid4().hex[:8]}",
        )
        member = OrgMember(org_id=org.id, user_id=user.id, role="owner")
        db.add_all([org, user, member])
        db.commit()
        return user.id, org.id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_credits_wallet_for_existing_user(client: TestClient) -> None:
    _user_id, org_id = _seed_user_and_org(client.SessionLocal, email="alice@example.com")

    resp = client.post(
        "/admin/wallets/credit",
        headers={"X-Admin-Key": "test-admin-secret"},
        json={"email": "alice@example.com", "amount_cents": 1_000_000},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["email"] == "alice@example.com"
    assert body["org_id"] == str(org_id)
    assert body["credited_cents"] == 1_000_000
    # Wallet was created and credited (no bonus on this tier by default).
    assert body["new_balance_cents"] >= 1_000_000


def test_rejects_missing_admin_header(client: TestClient) -> None:
    _seed_user_and_org(client.SessionLocal, email="bob@example.com")
    resp = client.post(
        "/admin/wallets/credit",
        json={"email": "bob@example.com", "amount_cents": 100},
    )
    # FastAPI returns 422 when a required Header is missing.
    assert resp.status_code == 422


def test_rejects_wrong_admin_key(client: TestClient) -> None:
    _seed_user_and_org(client.SessionLocal, email="carol@example.com")
    resp = client.post(
        "/admin/wallets/credit",
        headers={"X-Admin-Key": "wrong-key"},
        json={"email": "carol@example.com", "amount_cents": 100},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "invalid_admin_key"


def test_404_when_user_not_found(client: TestClient) -> None:
    resp = client.post(
        "/admin/wallets/credit",
        headers={"X-Admin-Key": "test-admin-secret"},
        json={"email": "nobody@example.com", "amount_cents": 100},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "user_not_found"


def test_422_on_non_positive_amount(client: TestClient) -> None:
    _seed_user_and_org(client.SessionLocal, email="dave@example.com")
    resp = client.post(
        "/admin/wallets/credit",
        headers={"X-Admin-Key": "test-admin-secret"},
        json={"email": "dave@example.com", "amount_cents": 0},
    )
    assert resp.status_code == 422


def test_503_when_admin_key_not_configured(monkeypatch) -> None:
    """If ADMIN_SECRET_KEY is blank in config, endpoint must refuse all calls."""
    from app import config as config_module
    from app.db import get_db
    from app.models.auth import Base as AuthBase
    from app.models.wallet import Base as WalletBase
    from app.routers import admin as admin_router

    def _blank_settings() -> Settings:
        return Settings(admin_secret_key="")  # type: ignore[call-arg]

    monkeypatch.setattr(config_module, "get_settings", _blank_settings)
    monkeypatch.setattr(admin_router, "get_settings", _blank_settings)

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    AuthBase.metadata.create_all(engine)
    WalletBase.metadata.create_all(engine)
    SL = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override():
        db = SL()
        try:
            yield db
        finally:
            db.close()

    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        resp = c.post(
            "/admin/wallets/credit",
            headers={"X-Admin-Key": "anything"},
            json={"email": "a@b.com", "amount_cents": 1},
        )
        assert resp.status_code == 503
        assert resp.json()["detail"] == "admin_not_configured"
    app.dependency_overrides.clear()
