# easy-credential — Master Plan (v0, locked)

> SaaS for organizations to issue digital credentials/badges. Issuers log in via
> Google/Facebook/Apple, design credentials (templates, custom, or AI), and pay
> per-issuance via a prepaid wallet. Each credential gets a unique, signed,
> LinkedIn-shareable public URL.

---

## Locked decisions

| # | Topic | Decision |
|---|---|---|
| 0 | Brand / domain | `easylearning.ai` with subdomain split (see below) |
| 1 | Recipient accounts | Passive in v1; optional accounts planned for v2 (data model ready) |
| 2 | Recharge tiers | Threshold-based: <$100 = 0%, $100+ = 10%, **$300+ = 15%**, $500+ = 20% |
| 3 | AI cost model | 10 free AI images / org / month, then $0.20 each. Template-tune always free |
| 4 | Open standards | Ship signed W3C VC / Open Badges 3.0 JSON-LD export in v1; deeper wallet integrations can be paid later |
| 5 | Compliance / market | US-first v1 → EU/GDPR v2 → SSO/SOC 2 v3; edtech opportunistic |
| 6 | Per-credential price | **$3.99** (integer cents = `399`) |

## Domains

| Subdomain | Purpose |
|---|---|
| `easylearning.ai` | Marketing site |
| `app.easylearning.ai` | Authenticated issuer dashboard |
| `api.easylearning.ai` | FastAPI backend + OAuth callbacks |
| `c.easylearning.ai` | Public credential URLs (LinkedIn-shareable) |
| `verify.easylearning.ai` | Standalone verification + `/.well-known/jwks.json` |
| `cdn.easylearning.ai` | Badge artwork (S3/R2 behind Cloudflare) |

Custom domains (per-issuer white-label) deferred to a Pro-tier feature in v3+.

## Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2,
  Authlib (OAuth), `cryptography` (Ed25519), Stripe SDK, boto3, RQ workers.
- **Frontend**: React 18 + TypeScript + Vite, TailwindCSS, shadcn/ui,
  React Router, TanStack Query, Konva.js (badge editor), Stripe.js.
- **Datastores**: Postgres 16, Redis 7, S3-compatible object storage (MinIO in dev).
- **Email**: Resend or SES.
- **Deploy**: Docker images → Fly.io / Render / AWS ECS. Frontend on Vercel
  or behind the same FastAPI container as static.

## Pricing summary

- $3.99 per credential issued, deducted atomically from the wallet at issue time.
- Recharge bonuses:
  - <$100 → 0%
  - $100–$299.99 → +10%
  - $300–$499.99 → +15%
  - ≥$500 → +20%
- All money stored as integer cents. Stripe is the source of truth via webhook.

## Sub-docs

- [`architecture.md`](./architecture.md)
- [`data-model.md`](./data-model.md)
- [`api.md`](./api.md)
- [`pricing.md`](./pricing.md)
- [`signing-and-verification.md`](./signing-and-verification.md)
- [`compliance.md`](./compliance.md)
- [`ai-design.md`](./ai-design.md)
- [`roadmap.md`](./roadmap.md)
