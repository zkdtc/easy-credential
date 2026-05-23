# API specification

All authenticated routes require an httpOnly session cookie issued at
`api.easylearning.ai`. Public routes are unauthenticated and rate-limited.

## Auth
- `GET  /auth/{provider}/login` — provider ∈ `google|facebook|apple`. Starts OAuth.
- `GET  /auth/{provider}/callback` — completes OAuth, upserts user, sets cookie.
- `POST /auth/logout`
- `GET  /me`
- `POST /auth/dev-login` — development only; creates a local demo session.

## Orgs
- `POST /orgs`
- `GET  /orgs/mine`
- `PATCH /orgs/{id}` (owner/admin)
- `POST /orgs/{id}/members`
- `DELETE /orgs/{id}/members/{user_id}`

## Templates
- `GET  /templates?scope=global|mine`
- `POST /templates`
- `GET  /templates/{id}`
- `DELETE /templates/{id}`

## AI design
- `POST /assets/badges/upload` — multipart `{org_id, file}` for PNG/JPEG/WebP badge artwork
- `POST /ai/design/image` — body `{org_id, prompt, style}` → `{image_url, source, content_type}`
- `POST /ai/design/tune-template` — body `{template_id, brand_color, name, vibe}`
- `GET  /ai/jobs/{id}`
- `GET  /ai/quota` — current month's usage + remaining free quota

## Wallet & payments
- `GET  /stripe/config` — authenticated publishable-key config for Stripe Elements
- `GET  /orgs/{id}/wallet`
- `GET  /orgs/{id}/wallet/transactions?cursor=&limit=`
- `POST /orgs/{id}/wallet/recharge` — body `{amount_cents}` → returns Stripe `client_secret`
- `POST /orgs/{id}/wallet/recharge/sync` — body `{payment_intent_id}`; verifies Stripe status and idempotently credits wallet
- `GET  /pricing/recharge-preview?amount_cents=` — server-computed bonus preview
- `POST /stripe/webhook` — Stripe → server; verifies signature, idempotent

## Credentials (issuer)
- `POST /credentials` — issue (deducts $3.99 atomically, see signing-and-verification.md)
- `POST /credentials/bulk` — multipart/form-data CSV upload
- `GET  /credentials?org_id=&q=&status=&cursor=`
- `GET  /credentials/{id}`
- `GET  /credentials/{id}/export` — signed W3C VC / Open Badges 3.0 JSON-LD
- `POST /credentials/{id}/revoke` — body `{reason}`
- `POST /credentials/{id}/resend-email`

## Public (no auth, hosted on `c.easylearning.ai`)
- `GET  /c/{slug}` — server-rendered HTML with full OG meta
- `GET  /c/{slug}/qr.png` — QR code linking back to `/c/{slug}`
- `GET  /api/public/credentials/{slug}` — JSON for the page
- `GET  /api/public/credentials/{slug}/verify` — signature & status check
- `GET  /api/public/credentials/{slug}/export` — signed W3C VC / Open Badges 3.0 JSON-LD
- `GET  /c/{slug}?format=ob3` — same JSON-LD export rendered inline
- `GET  /.well-known/jwks.json` — verification keys (Ed25519)
- `GET  /issuers/{org_id}` — issuer profile and public verification methods

## Standard error envelope
```json
{ "error": { "code": "wallet.insufficient_funds",
             "message": "Recharge required to issue this credential.",
             "details": {"required_cents": 399, "balance_cents": 120} } }
```

## Rate limits (Redis token bucket)
- Public `verify` & `c/{slug}`: 60 req/min/IP
- Issuance: 30 req/min/user
- AI image generation: 5 in-flight jobs/org
- Auth callbacks: 10/min/IP
