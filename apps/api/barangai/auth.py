import hashlib
import logging
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import UTC, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import LoginSession, Usage, User, now
from .usage import limit_setting, period_key, take

router = APIRouter(prefix="/auth")
hasher = PasswordHasher()
attempts = defaultdict(deque)
log = logging.getLogger(__name__)
# Each hash or check takes about 64 MB, so a burst of logins could otherwise run the 512 MB Render instance out of memory.
_hashing = threading.BoundedSemaphore(2)
_decoy = hasher.hash(secrets.token_urlsafe(16))
_chains_logged = set()
MAX_PASSWORD = 128
TERMS_VERSION = "2026-11-05"


def hash_password(password: str) -> str:
    with _hashing:
        return hasher.hash(password)


def password_matches(stored: str | None, password: str) -> bool:
    """Checks a decoy when the account does not exist, so response time does not reveal which emails are registered.
    Callers release their database connection first (db.rollback()), because this can wait for a free slot."""
    if len(password) > MAX_PASSWORD:
        return False
    try:
        with _hashing:
            return hasher.verify(stored or _decoy, password) and stored is not None
    except VerificationError:
        return False


# Words people pick most, compared after dropping capitals, symbols and trailing digits, so "Password@2026!" counts.
COMMON_PASSWORD_WORDS = frozenset(
    "password passw0rd passcode qwerty qwertyuiop qwertyui asdfghjkl zxcvbnm abc abcd abcdef abcdefgh iloveyou iloveu "
    "letmein welcome admin administrator user staff resident changeme secret monkey dragon sunshine princess football "
    "baseball basketball shadow master superman batman trustno barangay barangai barangaystaff kapitan mahalkita "
    "mahalko pilipinas philippines maynila manila dasmarinas cavite tagalog".split()
)
RUNS = ("1234567890" * 13, "0987654321" * 13, "abcdefghijklmnopqrstuvwxyz" * 5, "qwertyuiopasdfghjklzxcvbnm" * 5)


def password_problem(password: str, email: str = "") -> str | None:
    """Why a chosen password is too easy to guess, or None. Length is checked separately, by each caller's form."""
    if len(set(password)) == 1:
        return "A password can't be one character repeated"
    local = email.partition("@")[0].casefold()
    # Very short names would refuse ordinary words that happen to contain them.
    if len(local) >= 4 and local in password.casefold():
        return "A password can't contain your email name"
    plain = re.sub(r"[^a-z0-9]", "", password.casefold())
    word = plain.rstrip("0123456789")
    if (plain and any(plain in run for run in RUNS)) or (
        word and any(not word.replace(common, "") for common in COMMON_PASSWORD_WORDS)
    ):
        return "This password is too common. Choose another"
    return None


def check_password(password: str, email: str = "") -> None:
    problem = password_problem(password, email)
    if problem:
        raise HTTPException(422, problem)


def same(first: str, second: str) -> bool:
    """Constant-time comparison that also accepts text outside ASCII, which compare_digest refuses for str."""
    return secrets.compare_digest(first.encode("utf-8", "replace"), second.encode("utf-8", "replace"))


class Credentials(BaseModel):
    # Extra fields are kept so a supplied role can be refused explicitly rather than silently dropped.
    model_config = ConfigDict(extra="allow")
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=12, max_length=MAX_PASSWORD)
    accepted_terms: bool = False


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
            "barangay": user.barangay.name if user.barangay_id else None, "google": bool(user.identities),
            "must_change_password": bool(user.must_change_password)}


def proxy_hops():
    try:
        return max(0, int(os.environ.get("TRUSTED_PROXY_HOPS", "0") or 0))
    except ValueError:
        return 0


def client_ip(request):
    """The caller's address. Behind a proxy (Render) the socket peer is the proxy itself, shared by everyone.

    Set TRUSTED_PROXY_HOPS to the number of proxies that append to X-Forwarded-For in front of the app, and the
    address the outermost one recorded is used. Entries left of it are client-supplied and never trusted (unlike
    uvicorn's --forwarded-allow-ips="*", which takes the leftmost, spoofable entry).
    """
    hops = proxy_hops()
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if hops > 0 and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.client.host if request.client else "unknown"


def address_known(request):
    """False behind a proxy before TRUSTED_PROXY_HOPS is set: every caller then looks like the proxy. Each new chain
    length is logged, with the count only. A client can add entries but not remove them, so the operator sets the hop
    count to the smallest number logged. DIRECT_CONNECTIONS says no proxy exists (the laptop launcher), so a client's
    header cannot make callers look shared and loosen the limits."""
    if proxy_hops() or os.environ.get("DIRECT_CONNECTIONS", "").lower() == "true":
        return True
    forwarded = [part for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if forwarded and len(forwarded) not in _chains_logged and len(_chains_logged) < 32:
        _chains_logged.add(len(forwarded))
        log.warning("X-Forwarded-For has %d entries and TRUSTED_PROXY_HOPS is unset", len(forwarded))
    return not forwarded


def rate_limit(request, action, count=10, key=None):
    """At most `count` calls a minute per caller. Pass `key` (a user id or email) for signed-in actions, so residents
    sharing one network address (a proxy, school Wi-Fi) do not use up each other's allowance. In memory: a restart
    clears it, so lasting limits (reports per day) are counted in the database instead."""
    # While callers cannot be told apart, this is one shared limit, so loosen it: it stops a flood, and one client
    # should not reach it by ordinary use.
    if not key and not address_known(request):
        count *= 10
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


def address_digest(request) -> str:
    """Keeps plain addresses out of the counters. Unsalted, so this is tidiness rather than secrecy."""
    return hashlib.sha256(client_ip(request).encode()).hexdigest()[:16]


def within_address_cap(request, db, name, setting, default) -> bool:
    """A daily limit per network address, so one device can't use up a site-wide allowance. Generous on purpose: people
    behind one router share an address. Skipped while callers can't be told apart."""
    if not address_known(request):
        return True
    return take(db, period_key(f"{name}:{address_digest(request)}"), limit_setting(setting, default))


def failure_prefix(email: str) -> str:
    return f"login_fail:{hashlib.sha256(email.encode()).hexdigest()[:32]}"


def failure_limits(request, email: str) -> list[tuple[str, int]]:
    """Wrong passwords allowed today. Counted per email and address, so a stranger on the same Wi-Fi locks out only
    their own device and not the owner. The much higher cap per email stops guessing spread over many addresses."""
    prefix = failure_prefix(email)
    limits = [(period_key(prefix), limit_setting("MAX_LOGIN_FAILURES_PER_EMAIL_PER_DAY", 500))]
    if address_known(request):
        limits.append((period_key(f"{prefix}:{address_digest(request)}"), limit_setting("MAX_LOGIN_FAILURES_PER_DAY", 50)))
    return limits


def clear_login_failures(db, email: str) -> None:
    """After a password reset, so the owner isn't kept out by guesses made before it. The caller commits."""
    db.execute(delete(Usage).where(Usage.key.like(f"{failure_prefix(email)}:%")))


def create_session(response, db, user):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    db.execute(delete(LoginSession).where(LoginSession.expires_at < now()))
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
    if not session:
        raise HTTPException(401, "Authentication required")
    # SQLite returns these without a timezone; PostgreSQL returns them in the connection's.
    expires = session.expires_at
    if (expires if expires.tzinfo else expires.replace(tzinfo=UTC)) < now():
        raise HTTPException(401, "Authentication required")
    if session.user.disabled_at:
        raise HTTPException(401, "Authentication required")
    return session


def signed_in_user(request: Request, db: Session = Depends(get_db)):
    """Whoever holds the session. Only /auth/me uses this directly, so the app can see a password must be changed."""
    return current_session(request, db).user


def get_current_user(user: User = Depends(signed_in_user)):
    """Every other read: a temporary password someone else has seen opens nothing but the change-password screen."""
    if user.must_change_password:
        raise HTTPException(403, "Change your temporary password first")
    return user


def require_role(user: User, roles):
    if user.role not in roles:
        raise HTTPException(403, "Insufficient role")


def csrf_user(request: Request, db: Session = Depends(get_db)):
    """The signed-in user of a write. Only changing the password and signing out use this directly."""
    session = current_session(request, db)
    supplied = request.headers.get("X-CSRF-Token", "")
    if (
        not supplied
        or not same(supplied, session.csrf_token)
        or not same(request.cookies.get("csrf_token", ""), supplied)
    ):
        raise HTTPException(403, "Invalid CSRF token")
    return session.user


def require_csrf(user: User = Depends(csrf_user)):
    """Every other write: refused while the account still has a temporary password someone else has seen."""
    if user.must_change_password:
        raise HTTPException(403, "Change your temporary password first")
    return user


@router.post("/register", status_code=201)
def register(credentials: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(request, "register", 20)
    if any(key.strip().casefold() == "role" for key in credentials.model_extra or {}):
        raise HTTPException(403, "Role cannot be selected")
    if not credentials.accepted_terms:
        raise HTTPException(422, "Please agree to the terms and privacy notice")
    email = credentials.email.lower()
    check_password(credentials.password, email)
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    if not within_address_cap(request, db, "signups_ip", "MAX_SIGNUPS_PER_ADDRESS_PER_DAY", 30):
        raise HTTPException(429, "Too many new accounts from this network today. Please try again tomorrow.")
    # Counted across the whole site, because accounts need no email check and each one has its own report allowance.
    if not take(db, period_key("signups", hourly=True), limit_setting("MAX_SIGNUPS_PER_HOUR", 100)):
        raise HTTPException(429, "Too many new accounts right now. Please try again later.")
    user = User(email=email, password_hash=hash_password(credentials.password), role="resident",
                terms_accepted_at=now(), terms_version=TERMS_VERSION)
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
    if address_known(request):  # Otherwise this would be per account, and strangers could lock out the owner.
        rate_limit(request, "login", key=f"{email}|{client_ip(request)}")
    rate_limit(request, "login_account", 50, key=email)
    rate_limit(request, "login_address", 60)
    # Slow guessing over a whole day, kept in the database so a restart doesn't reset it. Counted for unknown emails
    # too, so this answer doesn't reveal which are registered.
    limits = failure_limits(request, email)
    for key, limit in limits:
        counted = db.get(Usage, key)
        if counted and counted.count >= limit:
            raise HTTPException(429, "Too many failed sign-ins. Try again tomorrow or ask your barangay hall.")
    user = db.scalar(select(User).where(User.email == credentials.email.lower()))
    stored = user.password_hash if user else None
    disabled = bool(user and user.disabled_at)
    db.rollback()
    if not password_matches(stored, credentials.password):
        for key, limit in limits:
            take(db, key, limit)
        raise HTTPException(401, "Invalid credentials")
    if disabled:  # The same answer as a wrong password: this says nothing to whoever is trying.
        raise HTTPException(401, "Invalid credentials")
    create_session(response, db, user)
    return user_data(user)


@router.get("/me")
def me(user: User = Depends(signed_in_user)):
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
def logout(response: Response, request: Request, db: Session = Depends(get_db), user: User = Depends(csrf_user)):
    token = request.cookies.get("session")
    db.delete(db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest()))
    db.commit()
    response.delete_cookie("session")
    response.delete_cookie("csrf_token")
