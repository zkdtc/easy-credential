# easy-credential

SaaS for organizations to issue verifiable digital credentials/badges with
unique, LinkedIn-shareable URLs.

> MVP slice is implemented: dev login, orgs, wallet ledger/recharge preview,
> signed credential issuance, public credential URLs, QR codes, JWKS, and
> verification, plus W3C VC / Open Badges 3.0 JSON-LD exports. See
> [`docs/PLAN.md`](./docs/PLAN.md) for the locked product design and
> [`docs/roadmap.md`](./docs/roadmap.md) for remaining work.

## Quick links

- Master plan: [`docs/PLAN.md`](./docs/PLAN.md)
- Architecture: [`docs/architecture.md`](./docs/architecture.md)
- Data model: [`docs/data-model.md`](./docs/data-model.md)
- API spec: [`docs/api.md`](./docs/api.md)
- Pricing & wallet: [`docs/pricing.md`](./docs/pricing.md)
- Signing & verification: [`docs/signing-and-verification.md`](./docs/signing-and-verification.md)
- AI design: [`docs/ai-design.md`](./docs/ai-design.md)
- Compliance plan: [`docs/compliance.md`](./docs/compliance.md)
- Deployment: [`docs/deploy.md`](./docs/deploy.md)
- Roadmap: [`docs/roadmap.md`](./docs/roadmap.md)

## Brand

Hosted on **easylearning.ai** with subdomain split:

| Subdomain | Purpose |
|---|---|
| `easylearning.ai` | Marketing |
| `app.easylearning.ai` | Issuer dashboard |
| `api.easylearning.ai` | Backend API |
| `c.easylearning.ai` | Public credential URLs |
| `verify.easylearning.ai` | Verification + JWKS |
| `cdn.easylearning.ai` | Badge artwork |

## Repo layout

```
easy-credential/
├── backend/                    FastAPI + SQLAlchemy + Alembic
├── frontend/                   Vite + React + TS
├── docker-compose.yml          Postgres + Redis + MinIO for local dev
├── .env.example
└── docs/
```

## Local dev — quick start

```bash
cp .env.example .env

# Start infra (Postgres + Redis + MinIO)
docker compose up -d

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8008

# Frontend (new shell)
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Backend will be at `http://localhost:8008`, with a health check at `/healthz`.
For local development without OAuth credentials, open `/login` and use the
demo workspace form. In development mode the wallet recharge button credits
the ledger immediately when Stripe keys are not configured.

## Google OAuth

Google login is disabled until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are set. Create a Google OAuth web client and make the Google Console values
match the local hosts exactly.

For the default README ports:

- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `http://localhost:8008/auth/google/callback`

If you run the app on alternate ports, use those exact values instead. For
example, with the current local servers:

- Authorized JavaScript origin: `http://127.0.0.1:5175`
- Authorized redirect URI: `http://127.0.0.1:8010/auth/google/callback`

Then update `.env`:

```bash
APP_URL=http://127.0.0.1:5175
API_URL=http://127.0.0.1:8010
PUBLIC_URL=http://127.0.0.1:8010
CORS_ORIGINS=http://127.0.0.1:5175
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Restart the backend after changing these values. The backend reads the
repo-root `.env` even when launched from `backend/`.

## Implemented MVP

- Development login with automatic personal organization creation.
- Wallet balance, transactions, threshold recharge bonuses, and Stripe
  PaymentIntent/webhook scaffolding.
- Atomic credential issuance with a $3.99 wallet charge.
- Ed25519 signatures over deterministic canonical credential payloads.
- Public `/c/{slug}` credential pages with LinkedIn deep links and QR codes.
- Signed W3C VC / Open Badges 3.0 JSON-LD exports for portable archives.
- Badge artwork upload plus AI/local badge generation in the issue flow.
- Public JSON, verification endpoint, issuer profile, and
  `/.well-known/jwks.json`.
- React dashboard, wallet, issue, credentials, and public credential views.

## Verify

```bash
cd backend && pytest -q && ruff check app tests
cd ../frontend && npm run build
```

## License

TBD.
