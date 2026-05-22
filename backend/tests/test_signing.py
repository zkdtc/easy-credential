"""Tests for Ed25519 signing helpers and canonical credential payloads."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.models import Credential, Org, SigningKey
from app.services.signing import (
    base58btc,
    base58btc_decode,
    build_credential_payload,
    canonical_json,
    random_public_slug,
    sha256_hex,
    sign_payload,
    signing_key_to_jwk,
    verify_payload,
)


def _test_key() -> SigningKey:
    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    return SigningKey(
        id=uuid.uuid4(),
        public_key=public_pem,
        private_key_pem=private_pem,
        algorithm="Ed25519",
        active=True,
    )


def test_sign_and_verify_payload_round_trip() -> None:
    key = _test_key()
    payload = {"b": 2, "a": {"nested": True}}

    signature = sign_payload(key, payload)

    assert verify_payload(key, payload, signature)
    assert not verify_payload(key, payload | {"b": 3}, signature)
    assert canonical_json({"b": 2, "a": 1}) == b'{"a":1,"b":2}'


def test_signing_key_jwk_shape() -> None:
    key = _test_key()

    jwk = signing_key_to_jwk(key)

    assert jwk["kty"] == "OKP"
    assert jwk["crv"] == "Ed25519"
    assert jwk["alg"] == "EdDSA"
    assert jwk["kid"] == str(key.id)
    assert jwk["x"]


def test_base58btc_round_trip_preserves_leading_zeroes() -> None:
    raw = b"\0\0hello"

    encoded = base58btc(raw)

    assert encoded.startswith("z11")
    assert base58btc_decode(encoded) == raw


def test_credential_payload_hashes_private_email_and_design() -> None:
    org = Org(
        id=uuid.uuid4(),
        name="Acme Academy",
        slug="acme",
        logo_url="https://cdn.example/logo.png",
        website="https://acme.example",
    )
    credential = Credential(
        id=uuid.uuid4(),
        public_slug="9aF2bQ7xV3pK",
        org_id=org.id,
        issued_by_user_id=uuid.uuid4(),
        design_json={"z": 1, "a": 2},
        image_url="https://cdn.example/badge.png",
        credential_name="Advanced Python Engineer",
        description="Completed the program.",
        recipient_name="Jane Doe",
        recipient_email="JANE@EXAMPLE.COM",
        requirements="Completed coursework and capstone.",
        skills=["python", "testing"],
        issued_at=datetime(2026, 5, 20, 22, 17, 32, tzinfo=UTC),
        expires_at=None,
        signature="pending",
        signing_key_id=uuid.uuid4(),
    )

    payload = build_credential_payload(credential, org)

    assert payload["credentialSubject"] == {
        "name": "Jane Doe",
        "email_hash": sha256_hex("jane@example.com"),
    }
    assert payload["achievement"]["skills"] == ["python", "testing"]
    assert payload["issuedOn"] == "2026-05-20T22:17:32Z"
    assert payload["design_hash"] == sha256_hex(b'{"a":2,"z":1}')


def test_random_public_slug_is_base62() -> None:
    slug = random_public_slug()

    assert len(slug) == 12
    assert slug.isalnum()
