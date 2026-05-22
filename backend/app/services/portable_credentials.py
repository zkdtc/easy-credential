"""Portable W3C VC / Open Badges 3.0 credential export helpers."""
from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.models import Credential, Org, SigningKey
from app.services.signing import (
    build_credential_payload,
    canonical_json,
    iso_z,
    sha256_hex,
    sign_data_integrity_jcs,
    signing_key_to_jwk,
)

VC_CONTEXT = "https://www.w3.org/ns/credentials/v2"
OPEN_BADGES_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
OPEN_BADGES_SCHEMA = (
    "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/"
    "ob_v3p0_achievementcredential_schema.json"
)
EASY_CREDENTIAL_VOCAB = "https://easycredential.local/ns#"
EASY_CREDENTIAL_CONTEXT = {
    "easyCredential": f"{EASY_CREDENTIAL_VOCAB}easyCredential",
    "canonicalPayload": f"{EASY_CREDENTIAL_VOCAB}canonicalPayload",
    "canonicalPayloadHash": f"{EASY_CREDENTIAL_VOCAB}canonicalPayloadHash",
    "legacySignature": f"{EASY_CREDENTIAL_VOCAB}legacySignature",
    "legacySignatureType": f"{EASY_CREDENTIAL_VOCAB}legacySignatureType",
    "verifyUrl": {"@id": f"{EASY_CREDENTIAL_VOCAB}verifyUrl", "@type": "@id"},
    "jwksUrl": {"@id": f"{EASY_CREDENTIAL_VOCAB}jwksUrl", "@type": "@id"},
    "statusUrl": {"@id": f"{EASY_CREDENTIAL_VOCAB}statusUrl", "@type": "@id"},
    "status": f"{EASY_CREDENTIAL_VOCAB}status",
    "publicKeyJwk": f"{EASY_CREDENTIAL_VOCAB}publicKeyJwk",
    "EasyCredentialStatus2026": f"{EASY_CREDENTIAL_VOCAB}EasyCredentialStatus2026",
}


def public_credential_url(credential: Credential) -> str:
    return f"{get_settings().public_url.rstrip('/')}/c/{credential.public_slug}"


def public_credential_export_url(credential: Credential) -> str:
    base = get_settings().public_url.rstrip("/")
    return f"{base}/api/public/credentials/{credential.public_slug}/export"


def issuer_profile_url(org: Org) -> str:
    return f"{get_settings().public_url.rstrip('/')}/issuers/{org.id}"


def verification_method_url(org: Org, key: SigningKey) -> str:
    return f"{issuer_profile_url(org)}#key-{key.id}"


def portable_credential_filename(credential: Credential) -> str:
    safe_slug = "".join(ch for ch in credential.public_slug if ch.isalnum())
    return f"{safe_slug}-openbadge-credential.json"


def build_portable_credential(
    credential: Credential,
    org: Org,
    key: SigningKey,
    *,
    status: str,
) -> dict[str, Any]:
    """Build a signed JSON-LD OpenBadgeCredential export."""
    public_url = public_credential_url(credential)
    verify_url = (
        f"{get_settings().public_url.rstrip('/')}"
        f"/api/public/credentials/{credential.public_slug}/verify"
    )
    canonical_payload = build_credential_payload(credential, org)
    subject_email_hash = canonical_payload["credentialSubject"]["email_hash"]
    achievement = {
        "id": f"{public_url}#achievement",
        "type": ["Achievement"],
        "name": credential.credential_name,
        "description": credential.description or credential.credential_name,
        "criteria": {
            "type": "Criteria",
            "narrative": credential.requirements or f"Issued by {org.name}.",
        },
        "tag": credential.skills or [],
        "image": _image(credential.image_url, f"{credential.credential_name} badge"),
    }
    issuer = {
        "id": issuer_profile_url(org),
        "type": ["Profile"],
        "name": org.name,
        "url": org.website,
        "image": _image(org.logo_url, f"{org.name} logo"),
    }
    easy_credential = {
        "canonicalPayload": canonical_payload,
        "canonicalPayloadHash": sha256_hex(canonical_json(canonical_payload)),
        "legacySignature": credential.signature,
        "legacySignatureType": "Ed25519DetachedJcs",
        "verifyUrl": verify_url,
        "jwksUrl": f"{get_settings().public_url.rstrip('/')}/.well-known/jwks.json",
        "publicKeyJwk": signing_key_to_jwk(key),
    }
    unsigned_document = _compact(
        {
            "@context": [VC_CONTEXT, OPEN_BADGES_CONTEXT, EASY_CREDENTIAL_CONTEXT],
            "id": public_url,
            "type": ["VerifiableCredential", "OpenBadgeCredential"],
            "name": credential.credential_name,
            "description": credential.description,
            "image": _image(credential.image_url, f"{credential.credential_name} badge"),
            "issuer": issuer,
            "validFrom": iso_z(credential.issued_at),
            "validUntil": iso_z(credential.expires_at),
            "awardedDate": iso_z(credential.issued_at),
            "credentialSubject": {
                "type": ["AchievementSubject"],
                "name": credential.recipient_name,
                "identifier": [
                    {
                        "type": "IdentityObject",
                        "identityType": "emailAddress",
                        "identityHash": subject_email_hash,
                        "hashed": True,
                    }
                ],
                "achievement": achievement,
            },
            "credentialSchema": [
                {
                    "id": OPEN_BADGES_SCHEMA,
                    "type": "1EdTechJsonSchemaValidator2019",
                }
            ],
            "credentialStatus": {
                "id": f"{public_url}#status",
                "type": "EasyCredentialStatus2026",
                "statusPurpose": "revocation",
                "status": status,
                "statusUrl": verify_url,
            },
            "refreshService": {
                "id": public_url,
                "type": "1EdTechCredentialRefresh",
            },
            "evidence": [
                {
                    "id": public_url,
                    "type": ["Evidence"],
                    "name": "Hosted verification page",
                    "description": "Public verification page for this credential.",
                }
            ],
        }
    )
    unsigned_document["easyCredential"] = easy_credential
    proof_options = {
        "type": "DataIntegrityProof",
        "cryptosuite": "eddsa-jcs-2022",
        "created": iso_z(credential.issued_at),
        "verificationMethod": verification_method_url(org, key),
        "proofPurpose": "assertionMethod",
    }
    return unsigned_document | {
        "proof": sign_data_integrity_jcs(key, unsigned_document, proof_options)
    }


def _image(url: str | None, caption: str) -> dict[str, str] | None:
    if not url:
        return None
    return {"id": url, "type": "Image", "caption": caption}


def _compact(value: Any) -> Any:
    if isinstance(value, dict):
        compacted = {
            key: _compact(item)
            for key, item in value.items()
            if item is not None and item != [] and item != {}
        }
        return {key: item for key, item in compacted.items() if item not in ({}, [])}
    if isinstance(value, list):
        return [
            compacted
            for item in value
            if (compacted := _compact(item)) is not None and compacted not in ({}, [])
        ]
    return value
