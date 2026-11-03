import base64
import hashlib
import mimetypes
import os
import re
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .accounts import router as accounts_router
from .auth import attempts
from .auth import router as auth_router
from .barangays import guard_duplicate_decision
from .barangays import router as barangays_router
from .body_limit import RequestBodyLimitMiddleware
from .brief import router as brief_router
from .cases import router as cases_router
from .chat import router as chat_router
from .checker import validate_configured_checker
from .db import database_url, upgrade_sqlite
from .duplicates import router as duplicates_router
from .geo import router as geo_router
from .google_auth import router as google_router
from .media import validate_storage_config
from .notifications import router as notifications_router
from .points import router as points_router
from .reports import router as reports_router
from .workflow import router as workflow_router


def create_app():
    validate_configured_checker()
    validate_storage_config()
    # The public site does not advertise its API; local development keeps the docs.
    hosted = {"docs_url": None, "redoc_url": None, "openapi_url": None} if os.environ.get("STATIC_SITE_DIR") else {}
    app = FastAPI(title="BarangAI API", root_path=os.environ.get("API_ROOT_PATH", ""), **hosted)
    attempts.clear()

    if database_url().startswith("sqlite"):
        upgrade_sqlite()
    app.include_router(auth_router)
    app.include_router(google_router)
    app.include_router(reports_router)
    app.include_router(workflow_router)
    app.include_router(accounts_router)
    app.include_router(chat_router)
    # Before duplicates_router: cases.py answers its two read routes, limited to the caller's barangay.
    app.include_router(cases_router)
    app.include_router(duplicates_router, dependencies=[Depends(guard_duplicate_decision)])
    app.include_router(notifications_router)
    app.include_router(geo_router)
    app.include_router(barangays_router)
    app.include_router(brief_router)
    app.include_router(points_router)
    app.add_middleware(RequestBodyLimitMiddleware)

    @app.get("/health", include_in_schema=False)
    def health():
        return {"status": "ok"}

    return app


# The installable-app manifest (apps/web/public); Python's table does not always know this type.
mimetypes.add_type("application/manifest+json", ".webmanifest")


class SiteFiles(StaticFiles):
    """Static website that answers client routes (paths without a file extension) with index.html."""

    async def get_response(self, path, scope):
        parts = Path(path).parts
        if any(part.startswith(".") for part in parts):
            raise StarletteHTTPException(404)  # Never serve dotfiles such as .env or .git, even if present.
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            # Unknown API paths stay API 404s; missing assets (with an extension) stay 404s.
            if error.status_code != 404 or "." in Path(path).name or (parts and parts[0].startswith("api")):
                raise
            return await super().get_response("index.html", scope)


def content_policy(index_html: str) -> str:
    """Scripts and styles from this site only, plus the small theme script in index.html, allowed by its hash. Styles
    may be inline because the animation and chart libraries set them. Map tiles come from OpenStreetMap."""
    hashes = [base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
              for body in re.findall(r"<script>(.*?)</script>", index_html, re.S)]
    scripts = " ".join(f"'sha256-{value}'" for value in hashes)
    return ("default-src 'self'; "
            f"script-src 'self' {scripts}; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; "
            "connect-src 'self' blob: data:; font-src 'self' data:; manifest-src 'self'; object-src 'none'; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


def site_app(api, directory):
    directory = Path(directory)
    if not (directory / "index.html").is_file():
        raise ValueError("STATIC_SITE_DIR must contain a built website")
    site = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    policy = content_policy((directory / "index.html").read_text(encoding="utf-8"))

    @site.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = policy
        if os.environ.get("COOKIE_SECURE", "true").lower() == "true":
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    site.mount("/api", api)
    site.mount("/", SiteFiles(directory=directory, html=True))
    return site


api = create_app()
app = site_app(api, os.environ["STATIC_SITE_DIR"]) if os.environ.get("STATIC_SITE_DIR") else api
