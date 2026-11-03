import hashlib
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import LoginSession, User, now

router = APIRouter(prefix="/auth")
hasher = PasswordHasher()
attempts = defaultdict(deque)


class Credentials(BaseModel):
    # Extra fields are kept so a supplied role can be refused explicitly rather than silently dropped.
    model_config = ConfigDict(extra="allow")
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=12, max_length=128)


class LoginCredentials(BaseModel):
    email: str
    password: str


PREFERENCES = {"theme": ("system", "light", "dark"), "language": ("en", "fil")}


class PreferencesInput(BaseModel):
    theme: str | None = None
    language: str | None = None


def user_data(user):
    saved = user.preferences if isinstance(user.preferences, dict) else {}
    preferences = {key: saved[key] for key, allowed in PREFERENCES.items() if saved.get(key) in allowed}
    return {"id": user.id, "email": user.email, "role": user.role, "preferences": preferences,
            "barangay": user.barangay.name if user.barangay_id else None}


def client_ip(request):
    """The caller's address. Behind a proxy (Render) the socket peer is the proxy itself, shared by everyone.

    Set TRUSTED_PROXY_HOPS to the number of proxies that append to X-Forwarded-For in front of the app, and the
    address the outermost one recorded is used. Entries left of it are client-supplied and never trusted (unlike
    uvicorn's --forwarded-allow-ips="*", which takes the leftmost, spoofable entry).
    """
    try:
        hops = int(os.environ.get("TRUSTED_PROXY_HOPS", "0") or 0)
    except ValueError:
        hops = 0
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if hops > 0 and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.client.host if request.client else "unknown"


def rate_limit(request, action, count=10, key=None):
    """At most `count` calls a minute per caller. Pass `key` (a user id or email) for signed-in actions, so residents
    sharing one network address (a proxy, school Wi-Fi) do not use up each other's allowance. In memory: a restart
    clears it, so lasting limits (reports per day) are counted in the database instead."""
    bucket_key = (action, key or client_ip(request))
    current = time.monotonic()
    if len(attempts) > 10_000:
        for stale in [name for name, items in attempts.items() if not items or items[-1] < current - 60]:
            del attempts[stale]
    bucket = attempts[bucket_key]
    while bucket and bucket[0] < current - 60:
        bucket.popleft()
    if len(bucket) >= count:
        raise HTTPException(429, "Too many requests")
    bucket.append(current)


def create_session(response, db, user):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    db.add(
        LoginSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            user_id=user.id,
            csrf_token=csrf,
            expires_at=now() + timedelta(days=7),
        )
    )
    db.commit()
    secure = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
    response.set_cookie("session", token, httponly=True, secure=secure, samesite="lax", max_age=604800)
    response.set_cookie("csrf_token", csrf, httponly=False, secure=secure, samesite="lax", max_age=604800)


def current_session(request: Request, db: Session):
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(401, "Authentication required")
    session = db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())
    if not session or session.expires_at.replace(tzinfo=None) < now().replace(tzinfo=None):
        raise HTTPException(401, "Authentication required")
    return session


def get_current_user(request: Request, db: Session = Depends(get_db)):
    return current_session(request, db).user


def require_role(user: User, roles):
    if user.role not in roles:
        raise HTTPException(403, "Insufficient role")


def require_csrf(request: Request, db: Session = Depends(get_db)):
    session = current_session(request, db)
    supplied = request.headers.get("X-CSRF-Token", "")
    if (
        not supplied
        or not secrets.compare_digest(supplied, session.csrf_token)
        or not secrets.compare_digest(request.cookies.get("csrf_token", ""), supplied)
    ):
        raise HTTPException(403, "Invalid CSRF token")
    return session.user


@router.post("/register", status_code=201)
def register(credentials: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(request, "register", 20)
    if any(key.strip().casefold() == "role" for key in credentials.model_extra or {}):
        raise HTTPException(403, "Role cannot be selected")
    email = credentials.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    user = User(email=email, password_hash=hasher.hash(credentials.password), role="resident")
    db.add(user)
    db.commit()
    db.refresh(user)
    create_session(response, db, user)
    return user_data(user)


@router.post("/login")
def login(credentials: LoginCredentials, request: Request, response: Response, db: Session = Depends(get_db)):
    # Password guessing is limited per account and address, so a stranger guessing elsewhere cannot lock the owner
    # out; a looser per-account cap stops guessing spread over many addresses, and a per-address cap stops one
    # machine trying many accounts. (On Render all callers share an address until TRUSTED_PROXY_HOPS is set.)
    email = credentials.email.strip().lower()[:320]
    rate_limit(request, "login", key=f"{email}|{client_ip(request)}")
    rate_limit(request, "login_account", 50, key=email)
    rate_limit(request, "login_address", 60)
    user = db.scalar(select(User).where(User.email == credentials.email.lower()))
    try:
        valid = bool(user and hasher.verify(user.password_hash, credentials.password))
    except VerifyMismatchError:
        valid = False
    if not valid:
        raise HTTPException(401, "Invalid credentials")
    create_session(response, db, user)
    return user_data(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_data(user)


@router.put("/preferences")
def save_preferences(body: PreferencesInput, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    """Appearance and language for this account, so they follow the person to another phone or computer."""
    saved = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    for key, value in body.model_dump(exclude_none=True).items():
        if value not in PREFERENCES[key]:
            raise HTTPException(422, "Unsupported preference")
        saved[key] = value
    user.preferences = saved
    db.commit()
    return user_data(user)


@router.post("/logout", status_code=204)
def logout(response: Response, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    token = request.cookies.get("session")
    db.delete(db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest()))
    db.commit()
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")
