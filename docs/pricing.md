# Pricing & wallet

## Per-credential
- **$3.99** = `399` cents, deducted from wallet at issuance time.
- Bulk issuance pre-checks `balance ≥ N × 399` before charging.

## Recharge bonus tiers

| Recharge | Bonus | Credit added | Effective $/credential* |
|---|---|---|---|
| < $100 | 0% | = amount | $3.99 |
| $100 – $299.99 | +10% | × 1.10 | ~$3.63 |
| $300 – $499.99 | **+15%** | × 1.15 | ~$3.47 |
| ≥ $500 | +20% | × 1.20 | ~$3.33 |

\* Effective = 399 ÷ (1 + bonus).

Stored in `pricing_rules` table — adjustable without redeploy. Future "whale"
tier (e.g., $2k+ → 25%) just needs a new row.

## Recharge flow

1. Client reads `GET /stripe/config`. If Stripe keys are configured, the wallet
   page loads Stripe Elements with the publishable key.
2. Client → `POST /orgs/{id}/wallet/recharge {amount_cents}` → backend creates
   Stripe `PaymentIntent` with metadata
   `{org_id, wallet_id, base_amount_cents, bonus_cents}`.
3. Stripe.js Payment Element confirms the payment using the returned
   `client_secret`.
4. Stripe webhook `payment_intent.succeeded` (server-side, source of truth):
   - Compute bonus using the active recharge tier helper.
   - In a single DB transaction:
     - Insert `wallet_transactions {type: 'recharge', amount_cents: +base}`
     - Insert `wallet_transactions {type: 'bonus',    amount_cents: +bonus, note: 'tier:$300+ 15%'}`
     - `UPDATE wallets SET balance_cents = balance_cents + base + bonus`
   - Idempotent via `unique(stripe_payment_intent_id)`.
5. Client may call `POST /orgs/{id}/wallet/recharge/sync` after a successful
   confirmation or redirect return. The server retrieves the PaymentIntent from
   Stripe and idempotently credits the wallet if the webhook has not arrived yet.

In development, if Stripe keys are empty or placeholders, recharge uses
`development_credit`. In production, missing Stripe keys return
`503 stripe_not_configured` instead of crediting funds.

## Issue-charge flow (race-safe)
```sql
BEGIN;
SELECT balance_cents FROM wallets WHERE id = :wid FOR UPDATE;
-- 402 Payment Required if balance < 399
INSERT INTO credentials (...) RETURNING id;
INSERT INTO wallet_transactions (type='issue_charge', amount_cents=-399, ...);
UPDATE wallets SET balance_cents = balance_cents - 399 WHERE id = :wid;
COMMIT;
```

## AI cost
- 10 free AI image generations / org / month (tracked in `ai_quotas`).
- Overage: $0.20 / image, deducted from wallet (`wallet_transactions.type='ai_generation'`).
- Template AI-tune: always free (soft cap 200/day/org).
- Safety: 500 paid images/month/org cap by default.

## Refunds
- Revoking a credential within 24h optionally refunds $3.99
  (`wallet_transactions.type='refund'`, configurable per org).
