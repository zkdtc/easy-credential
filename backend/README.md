# easy-credential backend

FastAPI service for the easy-credential platform.

Implemented local MVP surfaces:

- OAuth plus development login (`POST /auth/dev-login`).
- Wallet balance, transactions, recharge previews, development recharge, and
  Stripe webhook scaffolding.
- Credential issue/list/detail/revoke APIs.
- Public credential JSON, HTML page, QR image, verification, issuer profile,
  and JWKS.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8008
```

Swagger UI: http://localhost:8008/docs

## Test

```bash
pytest -q
ruff check app tests
```

## Migrations

```bash
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

See `../docs/` for the full design.
