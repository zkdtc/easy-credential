"""wallets and credentials

Revision ID: 0002_wallet_credentials
Revises: 0001_init_auth
Create Date: 2026-05-21 01:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0002_wallet_credentials"
down_revision: str | Sequence[str] | None = "0001_init_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    wallet_transaction_type = postgresql.ENUM(
        "recharge",
        "bonus",
        "issue_charge",
        "ai_generation",
        "refund",
        "adjustment",
        name="wallet_transaction_type",
        create_type=True,
    )
    verification_result = postgresql.ENUM(
        "valid",
        "expired",
        "revoked",
        "signature_invalid",
        "not_found",
        name="verification_result",
        create_type=True,
    )

    bind = op.get_bind()
    wallet_transaction_type.create(bind, checkfirst=True)
    verification_result.create(bind, checkfirst=True)

    op.create_table(
        "wallets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("balance_cents", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_wallets_org_id", "wallets", ["org_id"])

    op.create_table(
        "pricing_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("min_amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("max_amount_cents", sa.BigInteger()),
        sa.Column("bonus_bps", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "effective_from",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("effective_to", sa.DateTime(timezone=True)),
    )

    pricing_rules = sa.table(
        "pricing_rules",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("min_amount_cents", sa.BigInteger),
        sa.column("max_amount_cents", sa.BigInteger),
        sa.column("bonus_bps", sa.Integer),
        sa.column("active", sa.Boolean),
    )
    op.bulk_insert(
        pricing_rules,
        [
            {
                "id": "00000000-0000-4000-8000-000000000100",
                "name": "tier_under_100",
                "min_amount_cents": 0,
                "max_amount_cents": 9_999,
                "bonus_bps": 0,
                "active": True,
            },
            {
                "id": "00000000-0000-4000-8000-000000000110",
                "name": "tier_100",
                "min_amount_cents": 10_000,
                "max_amount_cents": 29_999,
                "bonus_bps": 1000,
                "active": True,
            },
            {
                "id": "00000000-0000-4000-8000-000000000300",
                "name": "tier_300",
                "min_amount_cents": 30_000,
                "max_amount_cents": 49_999,
                "bonus_bps": 1500,
                "active": True,
            },
            {
                "id": "00000000-0000-4000-8000-000000000500",
                "name": "tier_500",
                "min_amount_cents": 50_000,
                "max_amount_cents": None,
                "bonus_bps": 2000,
                "active": True,
            },
        ],
    )

    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(120)),
        sa.Column("design_json", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("preview_url", sa.String(1024)),
        sa.Column("is_ai_generated", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "signing_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("private_key_pem", sa.Text(), nullable=False),
        sa.Column("algorithm", sa.String(32), server_default="Ed25519", nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("retired_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("public_slug", sa.String(24), nullable=False, unique=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "issued_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "recipient_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("design_json", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("image_url", sa.String(1024)),
        sa.Column("credential_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("recipient_email", sa.String(320), nullable=False),
        sa.Column("recipient_linkedin_url", sa.String(1024)),
        sa.Column("requirements", sa.Text()),
        sa.Column("skills", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoke_reason", sa.Text()),
        sa.Column("signature", sa.Text(), nullable=False),
        sa.Column(
            "signing_key_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("signing_keys.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_credentials_public_slug", "credentials", ["public_slug"], unique=True)
    op.create_index("ix_credentials_org_issued_at", "credentials", ["org_id", "issued_at"])

    op.create_table(
        "wallet_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "wallet_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wallets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            postgresql.ENUM(name="wallet_transaction_type", create_type=False),
            nullable=False,
        ),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("balance_after_cents", sa.BigInteger(), nullable=False),
        sa.Column("stripe_payment_intent_id", sa.String(255)),
        sa.Column(
            "credential_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("credentials.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ai_job_id", postgresql.UUID(as_uuid=True)),
        sa.Column("note", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "stripe_payment_intent_id",
            name="uq_wallet_transactions_stripe_payment_intent_id",
        ),
    )
    op.create_index("ix_wallet_transactions_wallet_id", "wallet_transactions", ["wallet_id"])

    op.create_table(
        "verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "credential_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("credentials.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("verifier_ip", sa.String(64)),
        sa.Column("verifier_ua", sa.Text()),
        sa.Column(
            "result",
            postgresql.ENUM(name="verification_result", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_verifications_credential_id", "verifications", ["credential_id"])


def downgrade() -> None:
    op.drop_index("ix_verifications_credential_id", table_name="verifications")
    op.drop_table("verifications")
    op.drop_index("ix_wallet_transactions_wallet_id", table_name="wallet_transactions")
    op.drop_table("wallet_transactions")
    op.drop_index("ix_credentials_org_issued_at", table_name="credentials")
    op.drop_index("ix_credentials_public_slug", table_name="credentials")
    op.drop_table("credentials")
    op.drop_table("signing_keys")
    op.drop_table("templates")
    op.drop_table("pricing_rules")
    op.drop_index("ix_wallets_org_id", table_name="wallets")
    op.drop_table("wallets")
    bind = op.get_bind()
    postgresql.ENUM(name="verification_result").drop(bind, checkfirst=True)
    postgresql.ENUM(name="wallet_transaction_type").drop(bind, checkfirst=True)
