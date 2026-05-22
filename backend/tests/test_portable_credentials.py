"""Tests for W3C VC / Open Badges 3.0 portable exports."""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.models import Credential, Org, SigningKey
from app.services.portable_credentials import (
    OPEN_BADGES_CONTEXT,
    VC_CONTEXT,
    build_portable_credential,
)
from app.services.signing import (
    build_credential_payload,
    sha256_hex,
    sign_payload,
    verify_data_integrity_jcs,
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


def test_portable_credential_is_signed_json_ld_without_raw_email() -> None:
    key = _test_key()
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
        design_json={"accent": "#0284c7"},
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
        signing_key_id=key.id,
    )
    credential.signature = sign_payload(key, build_credential_payload(credential, org))

    exported = build_portable_credential(credential, org, key, status="active")

    assert exported["@context"][:2] == [VC_CONTEXT, OPEN_BADGES_CONTEXT]
    assert exported["type"] == ["VerifiableCredential", "OpenBadgeCredential"]
    assert exported["validFrom"] == "2026-05-20T22:17:32Z"
    assert exported["credentialSubject"]["identifier"] == [
        {
            "type": "IdentityObject",
            "identityType": "emailAddress",
            "identityHash": sha256_hex("jane@example.com"),
            "hashed": True,
        }
    ]
    assert exported["proof"]["type"] == "DataIntegrityProof"
    assert exported["proof"]["cryptosuite"] == "eddsa-jcs-2022"
    assert exported["proof"]["proofValue"].startswith("z")
    assert exported["easyCredential"]["legacySignature"] == credential.signature
    assert exported["easyCredential"]["publicKeyJwk"]["kid"] == str(key.id)
    assert verify_data_integrity_jcs(key, exported)
    assert verify_payload(
        key,
        exported["easyCredential"]["canonicalPayload"],
        exported["easyCredential"]["legacySignature"],
    )
    assert "JANE@EXAMPLE.COM" not in json.dumps(exported)
    assert "jane@example.com" not in json.dumps(exported).lower()


def test_portable_credential_proof_fails_after_tampering() -> None:
    key = _test_key()
    org = Org(
        id=uuid.uuid4(),
        name="Acme Academy",
        slug="acme",
    )
    credential = Credential(
        id=uuid.uuid4(),
        public_slug="9aF2bQ7xV3pK",
        org_id=org.id,
        issued_by_user_id=uuid.uuid4(),
        design_json={},
        image_url=None,
        credential_name="Advanced Python Engineer",
        description=None,
        recipient_name="Jane Doe",
        recipient_email="jane@example.com",
        requirements=None,
        skills=[],
        issued_at=datetime(2026, 5, 20, 22, 17, 32, tzinfo=UTC),
        expires_at=None,
        signature="pending",
        signing_key_id=key.id,
    )
    credential.signature = sign_payload(key, build_credential_payload(credential, org))
    exported = build_portable_credential(credential, org, key, status="active")

    tampered = dict(exported)
    tampered["name"] = "Different Credential"

    assert not verify_data_integrity_jcs(key, tampered)
