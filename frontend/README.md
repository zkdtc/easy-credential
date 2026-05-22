# easy-credential frontend

Vite + React + TypeScript + Tailwind. Issuer dashboard for the
easy-credential service.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

By default the app calls `http://localhost:8008`. Set `VITE_API_URL` if the
backend is hosted elsewhere; `/api/*` is also proxied to `:8008` for same-origin
experiments.

## Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard with wallet and issuance stats |
| `/login` | OAuth provider buttons plus development login |
| `/credentials` | Searchable list of issued credentials |
| `/issue` | Issue a signed credential |
| `/wallet` | Balance, recharge, and transaction history |
| `/c/:slug` | Public credential page with verification |
