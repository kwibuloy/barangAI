"""Optional Google resident sign-in; app sessions and permissions stay local."""

import base64
import hashlib
import os
import re
import secrets
import threading
import time
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import create_session, hasher, rate_limit
from .db import get_db
from .models import OAuthIdentity, User

router = APIRouter(prefix="/auth/google")
STATE_COOKIE = "google_oauth_state"
STATE_SECONDS = 600
pending = {}
pending_lock = threading.Lock()


def settings():
    values = {name: os.environ.get(name, "").strip() for name in (
        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI")}
    if not all(values.values()):
        return None
    try:
        uri = urlsplit(values["GOOGLE_REDIRECT_URI"])
        uri.port  # noqa: B018  (reading it rejects malformed ports before enabling the button)
    except ValueError:
        return None
    local = uri.hostname in {"localhost", "127.0.0.1", "::1"}
    if (uri.scheme != "https" and not (uri.scheme == "http" and local)) or not uri.hostname:
        return None
    if uri.username or uri.password or uri.query or uri.fragment:
        return None
    if not uri.path.endswith("/auth/google/callback"):
        return None
    return values


def exchange_code(code, verifier, config):
    # Google maintains signature, audience, issuer and expiry validation.
    import requests
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token

    with httpx.Client(timeout=15) as client:
        response = client.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": config["GOOGLE_CLIENT_ID"],
            "client_secret": config["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": config["GOOGLE_REDIRECT_URI"],
            "grant_type": "authorization_code", "code_verifier": verifier,
        })
        response.raise_for_status()
        token = response.json()["id_token"]

    # Bound certificate fetch time as well as token exchange time.
    with requests.Session() as session:
        transport = GoogleRequest(session=session)

        def certificate_request(*args, **kwargs):
            kwargs["timeout"] = 15
            return transport(*args, **kwargs)

        return id_token.verify_oauth2_token(token, certificate_request, config["GOOGLE_CLIENT_ID"])


def finish(error=None):
    response = RedirectResponse("/?auth_error=" + error if error else "/", status_code=303)
    response.delete_cookie(STATE_COOKIE)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/config")
def provider_config():
    return {"enabled": settings() is not None}


@router.get("/start")
def start(request: Request):
    config = settings()
    if not config:
        raise HTTPException(404, "Google sign-in is unavailable")
    rate_limit(request, "google_start")
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    with pending_lock:
        current = time.monotonic()
        for key in list(pending):
            if pending[key]["expires"] < current:
                del pending[key]
        if len(pending) >= 1000:
            raise HTTPException(429, "Please try signing in again shortly")
        pending[state] = {"nonce": nonce, "verifier": verifier, "expires": current + STATE_SECONDS}
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    response = RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": config["GOOGLE_CLIENT_ID"], "redirect_uri": config["GOOGLE_REDIRECT_URI"],
        "response_type": "code", "scope": "openid email", "state": state, "nonce": nonce,
        "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account",
    }), status_code=302)
    secure = config["GOOGLE_REDIRECT_URI"].startswith("https://")
    response.set_cookie(STATE_COOKIE, state, httponly=True, secure=secure, samesite="lax", max_age=STATE_SECONDS)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/callback")
def callback(request: Request, db: Session = Depends(get_db)):
    config = settings()
    if not config:
        raise HTTPException(404, "Google sign-in is unavailable")
    rate_limit(request, "google_callback", count=20)
    state = request.query_params.get("state", "")
    cookie = request.cookies.get(STATE_COOKIE, "")
    if not state or not cookie or not secrets.compare_digest(state, cookie):
        return finish("google_invalid_state")
    with pending_lock:
        transaction = pending.pop(state, None)
    if not transaction or transaction["expires"] < time.monotonic():
        return finish("google_invalid_state")
    if request.query_params.get("error"):
        return finish("google_cancelled")
    code = request.query_params.get("code", "")
    if not code or len(code) > 4096:
        return finish("google_failed")
    try:
        claims = exchange_code(code, transaction["verifier"], config)
        if not isinstance(claims.get("nonce"), str) or not secrets.compare_digest(claims["nonce"], transaction["nonce"]):
            return finish("google_failed")
        if claims.get("email_verified") is not True:
            return finish("google_email_unverified")
        subject, email = claims.get("sub"), claims.get("email")
        if not isinstance(subject, str) or not 1 <= len(subject) <= 255:
            return finish("google_failed")
        if not isinstance(email, str) or len(email) > 320 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            return finish("google_failed")
        if claims.get("azp", config["GOOGLE_CLIENT_ID"]) != config["GOOGLE_CLIENT_ID"]:
            return finish("google_failed")
    except Exception:
        # Never reflect provider tokens, credentials or upstream error details.
        return finish("google_failed")

    identity = db.scalar(select(OAuthIdentity).where(OAuthIdentity.provider == "google", OAuthIdentity.subject == subject))
    if identity:
        user = db.get(User, identity.user_id)
        if not user or user.role != "resident":
            return finish("google_resident_only")
    else:
        if db.scalar(select(User).where(User.email == email.lower())):
            return finish("google_account_exists")
        user = User(email=email.lower(), password_hash=hasher.hash(secrets.token_urlsafe(48)), role="resident")
        db.add(user)
        try:
            db.flush()
            db.add(OAuthIdentity(provider="google", subject=subject, user_id=user.id))
            db.flush()
        except IntegrityError:
            db.rollback()
            return finish("google_account_exists")
    response = finish()
    create_session(response, db, user)
    return response
