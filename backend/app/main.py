"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import REPO_ROOT, get_settings
from app.routers import auth, credentials, design, health, orgs, pricing, wallets
from app.services.badge_assets import media_root_path

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("easycred")

def frontend_dist_path() -> Path:
    path = Path(settings.frontend_dist_dir)
    return path if path.is_absolute() else REPO_ROOT / path


def frontend_index() -> Path | None:
    index = frontend_dist_path() / "index.html"
    return index if index.exists() else None


def create_app() -> FastAPI:
    app = FastAPI(
        title="easy-credential API",
        version="0.1.0",
        description=(
            "Issue verifiable digital credentials with unique, "
            "LinkedIn-shareable URLs."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Authlib stores the OAuth flow state in a Starlette session (separate
    # from our long-lived ec_session cookie; this one is short-lived).
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        session_cookie="ec_oauth_state",
        same_site="lax",
        https_only=settings.env == "production",
        max_age=600,
    )

    app.include_router(health.router)
    app.include_router(pricing.router)
    app.include_router(auth.router)
    app.include_router(orgs.router)
    app.include_router(wallets.router)
    app.include_router(design.router)
    app.include_router(credentials.router)

    media_root = media_root_path()
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media_root), name="media")

    frontend_dist = frontend_dist_path()
    frontend_assets = frontend_dist / "assets"
    if frontend_assets.exists():
        app.mount(
            "/app/assets",
            StaticFiles(directory=frontend_assets),
            name="frontend-assets",
        )

    @app.get("/")
    def root():
        index = frontend_index()
        if index:
            return RedirectResponse(url="/app", status_code=307)
        return {
            "service": "easy-credential",
            "version": "0.1.0",
            "env": settings.env,
            "docs": "/docs",
        }

    @app.get("/app", include_in_schema=False)
    def spa_root():
        index = frontend_index()
        if index:
            return FileResponse(index)
        return root()

    @app.get("/app/favicon.svg", include_in_schema=False)
    def frontend_favicon():
        favicon = frontend_dist_path() / "favicon.svg"
        if favicon.exists():
            return FileResponse(favicon)
        return spa_root()

    @app.get("/app/{full_path:path}", include_in_schema=False)
    def spa_page(full_path: str):
        index = frontend_index()
        if index:
            return FileResponse(index)
        return root()

    logger.info("easy-credential API starting in %s mode", settings.env)
    return app


app = create_app()
