"""Tests for recharge bonus tier logic."""
from __future__ import annotations

import pytest

from app.routers.pricing import compute_bonus_cents


@pytest.mark.parametrize(
    "amount, expected_bonus, expected_bps",
    [
        (1_000, 0, 0),          # $10  -> 0%
        (9_999, 0, 0),          # $99.99 -> 0%
        (10_000, 1_000, 1000),  # $100 -> +10% -> $10
        (29_999, 2_999, 1000),  # $299.99 -> +10%
        (30_000, 4_500, 1500),  # $300 -> +15% -> $45
        (49_999, 7_499, 1500),  # $499.99 -> +15%
        (50_000, 10_000, 2000), # $500 -> +20% -> $100
        (100_000, 20_000, 2000),# $1000 -> +20% -> $200
    ],
)
def test_compute_bonus_cents(amount: int, expected_bonus: int, expected_bps: int) -> None:
    bonus, bps = compute_bonus_cents(amount)
    assert bonus == expected_bonus
    assert bps == expected_bps


def test_compute_bonus_cents_rejects_negative() -> None:
    with pytest.raises(ValueError):
        compute_bonus_cents(-1)
