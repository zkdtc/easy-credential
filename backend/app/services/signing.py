"""Ed25519 signing and public verification helpers."""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import string
import uuid
from datetime import UTC, datetime
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import Credential, Org, SigningKey

BASE62_ALPHABET = string.digits + string.ascii_letters
BASE58_BTC_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def base58btc(data: bytes) -> str:
    """Encode bytes as multibase base58-btc."""
    if not data:
        return "z"

    number = int.from_bytes(data, "big")
    encoded = ""
    while number:
        number, remainder = divmod(number, 58)
        encoded = BASE58_BTC_ALPHABET[remainder] + encoded

    leading_zeroes = len(data) - len(data.lstrip(b"\0"))
    return "z" + (BASE58_BTC_ALPHABET[0] * leading_zeroes) + encoded


def base58btc_decode(value: str) -> bytes:
    if not value.startswith("z"):
        raise ValueError("base58btc value must start with multibase prefix 'z'")

    payload = value[1:]
    number = 0
    for char in payload:
        number *= 58
        try:
            number += BASE58_BTC_ALPHABET.index(char)
        except ValueError as exc:
            raise ValueError("invalid base58btc character") from exc

    raw = b"" if number == 0 else number.to_bytes((number.bit_length() + 7) // 8, "big")
    leading_zeroes = len(payload) - len(payload.lstrip(BASE58_BTC_ALPHABET[0]))
    return (b"\0" * leading_zeroes) + raw


def canonical_json(data: dict[str, Any]) -> bytes:
    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def sha256_hex(data: bytes | str) -> str:
    raw = data.encode("utf-8") if isinstance(data, str) else data
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def random_public_slug(length: int = 12) -> str:
    return "".join(secrets.choice(BASE62_ALPHABET) for _ in range(length))


def iso_z(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def build_credential_payload(credential: Credential, org: Org) -> dict[str, Any]:
    """Build the deterministic payload covered by the Ed25519 signature."""
    design_json = credential.design_json or {}
    return {
        "v": 1,
        "slug": credential.public_slug,
        "issuer": {
            "id": f"{get_settings().public_url.rstrip('/')}/issuers/{org.id}",
            "name": org.name,
            "url": org.website,
            "image": org.logo_url,
        },
        "credentialSubject": {
            "name": credential.recipient_name,
            "email_hash": sha256_hex(credential.recipient_email.strip().lower()),
        },
        "achievement": {
            "name": credential.credential_name,
            "description": credential.description,
            "criteria": {"narrative": credential.requirements},
            "skills": credential.skills or [],
        },
        "issuedOn": iso_z(credential.issued_at),
        "expires": iso_z(credential.expires_at),
        "image": credential.image_url,
        "design_hash": sha256_hex(canonical_json(design_json)),
    }


def ensure_active_signing_key(db: DbSession) -> SigningKey:
    key = db.execute(
        select(SigningKey).where(SigningKey.active.is_(True)).order_by(SigningKey.created_at)
    ).scalars().first()
    if key:
        return key

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    key = SigningKey(
        id=uuid.uuid4(),
        public_key=public_pem,
        private_key_pem=private_pem,
        algorithm="Ed25519",
        active=True,
    )
    db.add(key)
    db.flush()
    return key


def sign_payload(key: SigningKey, payload: dict[str, Any]) -> str:
    return base64url(sign_bytes(key, canonical_json(payload)))


def sign_bytes(key: SigningKey, data: bytes) -> bytes:
    private_key = serialization.load_pem_private_key(
        key.private_key_pem.encode("ascii"),
        password=None,
    )
    if not isinstance(private_key, Ed25519PrivateKey):
        raise TypeError("active signing key is not Ed25519")
    return private_key.sign(data)


def verify_payload(key: SigningKey, payload: dict[str, Any], signature: str) -> bool:
    return verify_bytes(key, canonical_json(payload), base64url_decode(signature))


def verify_bytes(key: SigningKey, data: bytes, signature: bytes) -> bool:
    public_key = serialization.load_pem_public_key(key.public_key.encode("ascii"))
    if not isinstance(public_key, Ed25519PublicKey):
        return False
    try:
        public_key.verify(signature, data)
    except (InvalidSignature, ValueError):
        return False
    return True


def data_integrity_jcs_hash(
    unsecured_document: dict[str, Any],
    proof_options: dict[str, Any],
) -> bytes:
    """Return hashData for W3C DataIntegrityProof eddsa-jcs-2022."""
    proof_config = dict(proof_options)
    if "@context" in unsecured_document:
        proof_config["@context"] = unsecured_document["@context"]

    transformed_document_hash = hashlib.sha256(
        canonical_json(unsecured_document)
    ).digest()
    proof_config_hash = hashlib.sha256(canonical_json(proof_config)).digest()
    return proof_config_hash + transformed_document_hash


def sign_data_integrity_jcs(
    key: SigningKey,
    unsecured_document: dict[str, Any],
    proof_options: dict[str, Any],
) -> dict[str, Any]:
    """Create a DataIntegrityProof using the eddsa-jcs-2022 hash algorithm."""
    proof = dict(proof_options)
    if "@context" in unsecured_document:
        proof["@context"] = unsecured_document["@context"]
    proof["proofValue"] = base58btc(
        sign_bytes(key, data_integrity_jcs_hash(unsecured_document, proof))
    )
    return proof


def verify_data_integrity_jcs(key: SigningKey, secured_document: dict[str, Any]) -> bool:
    proof = secured_document.get("proof")
    if isinstance(proof, list):
        proof = proof[0] if proof else None
    if not isinstance(proof, dict):
        return False

    proof_value = proof.get("proofValue")
    if not isinstance(proof_value, str):
        return False

    unsecured_document = dict(secured_document)
    unsecured_document.pop("proof", None)
    proof_options = dict(proof)
    proof_options.pop("proofValue", None)

    if "@context" in proof_options:
        proof_context = proof_options.pop("@context")
        document_context = secured_document.get("@context")
        if not isinstance(document_context, list):
            return False
        if document_context[: len(proof_context)] != proof_context:
            return False
        unsecured_document["@context"] = proof_context

    try:
        proof_bytes = base58btc_decode(proof_value)
    except ValueError:
        return False
    return verify_bytes(
        key,
        data_integrity_jcs_hash(unsecured_document, proof_options),
        proof_bytes,
    )


def signing_key_to_jwk(key: SigningKey) -> dict[str, str]:
    public_key = serialization.load_pem_public_key(key.public_key.encode("ascii"))
    if not isinstance(public_key, Ed25519PublicKey):
        raise TypeError("signing key is not Ed25519")
    raw = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return {
        "kty": "OKP",
        "crv": "Ed25519",
        "kid": str(key.id),
        "use": "sig",
        "alg": "EdDSA",
        "x": base64url(raw),
    }
