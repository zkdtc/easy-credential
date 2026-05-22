"""Auth-domain models: users, orgs, org_members, sessions.

Sprint 2 scope. Recipient-account fields (`recipient_user_id` on credentials)
are reserved here for v2 per docs/PLAN.md decision #2.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

# ---------- enums ----------
AUTH_PROVIDERS = ("google", "facebook", "apple", "github", "saml", "oidc")
"""`saml` and `oidc` are reserved for v3 enterprise SSO (see docs/compliance.md)."""

ORG_ROLES = ("owner", "admin", "issuer")


# ---------- models ----------
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    auth_provider: Mapped[str] = mapped_column(
        SAEnum(*AUTH_PROVIDERS, name="auth_provider"), nullable=False
    )
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    default_org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    memberships: Mapped[list[OrgMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    default_org: Mapped[Org | None] = relationship(
        foreign_keys=[default_org_id], post_update=True
    )

    __table_args__ = (
        UniqueConstraint(
            "auth_provider", "provider_subject", name="uq_user_provider_subject"
        ),
    )


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1024))
    website: Mapped[str | None] = mapped_column(String(1024))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Multi-region routing field (v2 ready, see docs/compliance.md)
    data_region: Mapped[str] = mapped_column(String(32), default="us-east-1")
    # Org-level feature flags, e.g. {"open_badges_3": {"enabled": false}}
    feature_flags: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # v3 enterprise SSO config placeholder
    sso_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # Per-org AI quota overrides
    ai_perks_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    members: Mapped[list[OrgMember]] = relationship(
        back_populates="org", cascade="all, delete-orphan"
    )


class OrgMember(Base):
    __tablename__ = "org_members"

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orgs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(
        SAEnum(*ORG_ROLES, name="org_role"), nullable=False, default="issuer"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    org: Mapped[Org] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class Session(Base):
    """Server-side session table (decision Q3 = A).

    The session id stored in the httpOnly cookie is `id` (uuid4). Revoking a
    session is just a DELETE on this row.
    """

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_sessions_user_expires", "user_id", "expires_at"),
    )


if TYPE_CHECKING:  # pragma: no cover
    pass
