# Contributing

## Branches
- `main` — protected; PRs only.
- Feature branches: `feat/<area>/<short-desc>`, e.g., `feat/wallet/recharge-preview`.

## Commit style
Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.

## Backend
```bash
cd backend
pip install -e ".[dev]"
ruff check app tests
pytest -q
```

## Frontend
```bash
cd frontend
npm install
npm run build
```

## Adding migrations
```bash
cd backend
alembic revision --autogenerate -m "add foo"
alembic upgrade head
```
