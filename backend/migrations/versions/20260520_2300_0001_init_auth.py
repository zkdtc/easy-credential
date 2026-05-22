"""init auth (users, orgs, org_members, sessions)

Revision ID: 0001_init_auth
Revises:
Create Date: 2026-05-20 23:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0001_init_auth"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    auth_provider = postgresql.ENUM(
        "google", "facebook", "apple", "github", "saml", "oidc",
        name="auth_provider", create_type=True,
    )
    org_role = postgresql.ENUM("owner", "admin", "issuer", name="org_role", create_type=True)

    bind = op.get_bind()
    auth_provider.create(bind, checkfirst=True)
    org_role.create(bind, checkfirst=True)

    op.create_table(
        "orgs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("logo_url", sa.String(1024)),
        sa.Column("website", sa.String(1024)),
        sa.Column("verified", sa.Boolean, server_default=sa.false(), nullable=False),
        sa.Column("data_region", sa.String(32), server_default="us-east-1", nullable=False),
        sa.Column("feature_flags", postgresql.JSONB, server_default="{}", nullable=False),
        sa.Column("sso_config", postgresql.JSONB, server_default="{}", nullable=False),
        sa.Column("ai_perks_json", postgresql.JSONB, server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_index("ix_orgs_slug", "orgs", ["slug"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column("avatar_url", sa.String(1024)),
        sa.Column("auth_provider",
                  postgresql.ENUM(name="auth_provider", create_type=False),
                  nullable=False),
        sa.Column("provider_subject", sa.String(255), nullable=False),
        sa.Column("default_org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.UniqueConstraint("auth_provider", "provider_subject",
                            name="uq_user_provider_subject"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "org_members",
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("orgs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", postgresql.ENUM(name="org_role", create_type=False),
                  server_default="issuer", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_index("ix_sessions_user_expires", "sessions", ["user_id", "expires_at"])


def downgrade() -> None:
    op.drop_index("ix_sessions_user_expires", table_name="sessions")
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("org_members")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_orgs_slug", table_name="orgs")
    op.drop_table("orgs")
    bind = op.get_bind()
    postgresql.ENUM(name="org_role").drop(bind, checkfirst=True)
    postgresql.ENUM(name="auth_provider").drop(bind, checkfirst=True)
