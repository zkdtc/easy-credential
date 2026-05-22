"""Pricing helpers shared by wallet and preview endpoints."""
from __future__ import annotations

# Tier table (min_cents, bonus_bps). Sorted descending by min_cents.
RECHARGE_TIERS: list[tuple[int, int]] = [
    (50_000, 2000),  # >= $500 -> +20%
    (30_000, 1500),  # >= $300 -> +15%
    (10_000, 1000),  # >= $100 -> +10%
    (0, 0),
]


def compute_bonus_cents(amount_cents: int) -> tuple[int, int]:
    """Return (bonus_cents, bonus_bps) for a given recharge amount in cents."""
    if amount_cents < 0:
        raise ValueError("amount_cents must be non-negative")
    for min_cents, bps in RECHARGE_TIERS:
        if amount_cents >= min_cents:
            return amount_cents * bps // 10_000, bps
    return 0, 0
