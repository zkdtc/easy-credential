# Roadmap

## Current state
- Sprints 1–4 now have a functional local MVP path: dev login, org bootstrap,
  wallet ledger/recharge preview, development recharge, signed credential
  issuance, credential list/revoke, public URLs, QR codes, JWKS, signature
  verification, and W3C VC / Open Badges 3.0 JSON-LD exports.
- Stripe PaymentIntent and webhook scaffolding exists; the React Stripe.js
  confirmation step remains the production payment handoff.
- Sprint 5+ items are still future work: template editor, AI design workers,
  bulk CSV issuance, production rate limits, and audit UI.

## Sprint 1 — Foundations (this scaffold)
- Repo layout, Docker Compose (Postgres + Redis + MinIO).
- FastAPI skeleton with health, settings, DB session, Alembic init.
- Vite/React shell with router, Tailwind, layout, placeholder routes.
- Root README, `.env.example`, CI stub.

## Sprint 2 — Auth + Orgs
- Google/Facebook/Apple OAuth via Authlib.
- Session cookies (httpOnly, scoped to `app.`), CSRF for mutations.
- `users`, `orgs`, `org_members` migrations.
- Dashboard shell + org switcher.

## Sprint 3 — Credentials core
- Data model + migrations for `templates`, `credentials`, `signing_keys`.
- Ed25519 signing service; `/.well-known/jwks.json`.
- Issue/list/detail APIs; public `/c/{slug}` page + OG meta.
- LinkedIn "Add to profile" deep link.
- QR code endpoint.
- OB3-compatible export (`?format=ob3` returns signed JSON-LD).

## Sprint 4 — Wallet + Stripe
- `wallets`, `wallet_transactions`, `pricing_rules` migrations.
- Stripe PaymentIntent create + webhook handler (idempotent).
- Atomic issue-charge with `FOR UPDATE` lock.
- Wallet UI: balance card, transaction history, recharge with live bonus preview.

## Sprint 5 — Templates + editor
- Global template seed data.
- Konva-based editor; save custom templates.
- Server-side PNG snapshot rendering after editor save.
- Bulk CSV issuance with cost preview.

## Sprint 6 — AI design + polish
- AI image generation worker + quota tracking.
- Template AI-tune endpoint with JSON-schema validation.
- Revoke/refund flow.
- Rate limits, audit log surfacing in admin views.
- Production deploy.

## v2 (after launch)
- Optional recipient accounts + recipient wall page (`c.easylearning.ai/u/{handle}`).
- EU data residency option.
- Wallet import integrations and richer third-party OB3 certification work.

## v3
- SSO (SAML/OIDC), SCIM, audit export.
- SOC 2 Type I.
- Custom domain white-label for issuer orgs.
