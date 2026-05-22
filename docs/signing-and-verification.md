# Signing & verification

## Algorithm
- **Ed25519** (RFC 8032). Fast, deterministic, tiny signatures (64 bytes),
  used for the Open Badges 3.0 JSON-LD export with `eddsa-jcs-2022`.
- Private keys stored encrypted via KMS (AWS KMS / GCP KMS).
- Keys rotated quarterly; old keys remain available for verification.

MVP implementation note: the development scaffold stores the generated private
key PEM in `signing_keys.private_key_pem` so local issuance works without KMS.
Production should replace that column/flow with KMS-wrapped key material.

## Public URL
- Canonical: `https://c.easylearning.ai/c/{slug}`
- `slug`: 12-char base62 (`[0-9A-Za-z]`), ~71 bits entropy — unguessable.
- Optional alias: `/c/{slug}/{kebab-name}` redirects to canonical.

## Canonical payload (signed)
JSON with **sorted keys**, **no whitespace**. OB3-compatible vocabulary is
also embedded in the portable JSON-LD export for offline verification.

```jsonc
{
  "v": 1,
  "slug": "9aF2bQ7xV3pK",
  "issuer": {
    "id": "https://easylearning.ai/issuers/{org_id}",
    "name": "Acme Academy",
    "url":  "https://acme.example",
    "image":"https://cdn.easylearning.ai/.../logo.png"
  },
  "credentialSubject": {
    "name": "Jane Doe",
    "email_hash": "sha256:..."
  },
  "achievement": {
    "name": "Advanced Python Engineer",
    "description": "...",
    "criteria": { "narrative": "Completed 40h coursework + capstone." },
    "skills": ["python","async","testing"]
  },
  "issuedOn":  "2026-05-20T22:17:32Z",
  "expires":   null,
  "image":     "https://cdn.easylearning.ai/.../badge.png",
  "design_hash": "sha256:..."
}
```

## Sign
```
sig = Ed25519.sign(privkey_active, canonical_bytes(payload))
store: credentials.signature        = base64url(sig)
       credentials.signing_key_id   = active_key.id
```

## Verify (`GET /api/public/credentials/{slug}/verify`)
1. Load credential by slug.
2. Reconstruct canonical payload from DB columns (deterministic).
3. Fetch `signing_keys` row by `signing_key_id` and verify.
4. Return:
   ```json
   {
     "valid": true,
     "revoked": false,
     "expired": false,
     "signed_at": "...",
     "issuer_verified": true,
     "key_id": "..."
   }
   ```
5. Append to `verifications` audit table (IP, UA, result).

## JWKS
- `GET /.well-known/jwks.json` returns active + retired (non-expired) Ed25519
  public keys in JWK form. Lets third parties verify offline.

## Portable W3C VC / Open Badges 3.0 export
Every issued credential can be exported as signed JSON-LD:

- Issuer route: `GET /credentials/{id}/export`
- Public route: `GET /api/public/credentials/{slug}/export`
- Public URL shortcut: `GET /c/{slug}?format=ob3`

The exported document uses:

```jsonc
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    {"easyCredential": "https://easycredential.local/ns#easyCredential"}
  ],
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "credentialSubject": {
    "type": ["AchievementSubject"],
    "identifier": [{
      "type": "IdentityObject",
      "identityType": "emailAddress",
      "identityHash": "sha256:...",
      "hashed": true
    }],
    "achievement": {"type": ["Achievement"]}
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-jcs-2022",
    "proofPurpose": "assertionMethod",
    "proofValue": "z..."
  }
}
```

The proof follows the W3C Data Integrity `eddsa-jcs-2022` hash shape:
SHA-256 of canonical proof configuration joined with SHA-256 of canonical
document, then Ed25519-signed and encoded as multibase base58-btc. The export
also includes an `easyCredential` extension with the original canonical payload,
its hash, the legacy detached signature, the public JWK, and the hosted verify
URL. That means a recipient who saved the JSON file can still verify the claims
and issuer key even if the hosted page is unavailable.

## LinkedIn "Add to profile" deep link
```
https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME
  &name={credential_name}
  &organizationName={org_name}
  &issueYear=YYYY&issueMonth=MM
  &expirationYear=YYYY&expirationMonth=MM
  &certUrl=https://c.easylearning.ai/c/{slug}
  &certId={slug}
```
