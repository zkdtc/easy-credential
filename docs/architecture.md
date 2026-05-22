# Architecture

```
                    ┌─────────────────────────────┐
                    │ React (Vite + TS) Frontend  │
                    │  app.easylearning.ai        │
                    └──────────────┬──────────────┘
                                   │ HTTPS, httpOnly cookie
                                   ▼
                    ┌─────────────────────────────┐
                    │ FastAPI Backend             │
                    │  api.easylearning.ai        │
                    │  - Auth (Authlib OAuth)     │
                    │  - Credentials API          │
                    │  - Wallet / Stripe          │
                    │  - AI design service        │
                    │  - Public viewer + verify   │
                    └────┬───────────────┬────────┘
                         │               │
              ┌──────────▼──┐     ┌──────▼────────┐
              │ Postgres 16 │     │ Object store  │
              │ (SQLAlchemy │     │ S3 / R2       │
              │  + Alembic) │     │ cdn.easyl...  │
              └──────┬──────┘     └───────────────┘
                     │
                     ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
   │ Stripe      │  │ OpenAI/SDXL  │  │ Redis (queue +   │
   │ payments    │  │ AI design    │  │ rate limiting)   │
   └─────────────┘  └──────────────┘  └──────────────────┘
```

## Subdomain → service mapping

| Hostname | Serves |
|---|---|
| `easylearning.ai` | Static marketing site (separate, e.g. Vercel/Cloudflare Pages) |
| `app.easylearning.ai` | React SPA (issuer dashboard), CORS-restricted to api subdomain |
| `api.easylearning.ai` | FastAPI app, OAuth callbacks, Stripe webhooks |
| `c.easylearning.ai` | Server-rendered public credential pages (FastAPI w/ Jinja or React SSR) |
| `verify.easylearning.ai` | Verify endpoint + `/.well-known/jwks.json` |
| `cdn.easylearning.ai` | Object storage proxied via Cloudflare |

## Cookie scoping

- Auth cookie set on **`app.easylearning.ai`** only (Domain attribute scoped),
  never sent to public credential or CDN hosts.
- CSRF: double-submit token for state-changing dashboard requests.

## Background jobs

- **RQ** workers (Redis-backed) for:
  - AI image generation
  - Email notifications
  - PNG snapshot rendering after editor save
  - Monthly AI quota reset (cron)
  - Webhook retries for downstream systems (future)

## Observability

- Structured logs (JSON) with request id correlation.
- Sentry for errors (frontend + backend).
- Prometheus metrics + Grafana (issue rate, recharge volume, AI cost).
- Audit log table (`audit_events`) for compliance.
