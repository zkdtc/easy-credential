"""Application configuration loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    env: str = "development"
    log_level: str = "INFO"
    secret_key: str = "change-me-in-prod"

    # URLs / CORS
    app_url: str = "http://localhost:5173"
    api_url: str = "http://localhost:8008"
    public_url: str = "http://localhost:8008"
    cookie_domain: str = "localhost"
    cors_origins: str = "http://localhost:5173"

    # Database
    database_url: str = (
        "postgresql+psycopg://easycred:easycred@localhost:5432/easycred"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Object storage
    s3_endpoint: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket: str = "easycred-dev"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    cdn_base_url: str = "http://localhost:9000/easycred-dev"
    media_root: str = str(REPO_ROOT / "backend" / "media")
    frontend_dist_dir: str = str(REPO_ROOT / "frontend" / "dist")

    # Stripe
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""

    # OAuth - Google
    google_client_id: str = ""
    google_client_secret: str = ""

    # OAuth - Facebook
    facebook_client_id: str = ""
    facebook_client_secret: str = ""

    # OAuth - Apple
    apple_client_id: str = ""
    apple_team_id: str = ""
    apple_key_id: str = ""
    apple_private_key: str = ""

    # OAuth - GitHub
    github_client_id: str = ""
    github_client_secret: str = ""

    # AI
    openai_api_key: str = ""
    replicate_api_token: str = ""

    # Email
    email_provider: str = "resend"
    resend_api_key: str = ""
    email_from: str = "notifications@send.easylearning.ai"

    # Admin
    admin_secret_key: str = ""

    # Pricing
    credential_price_cents: int = 399

    # Signing
    signing_key_pem_path: str = "./signing-key.pem"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
