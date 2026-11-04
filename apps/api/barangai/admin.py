"""Administrators manage staff accounts here, so starting a barangay needs no terminal. There is no email
service, so a new or reset password is generated here and shown once, for the administrator to hand over in person.
Residents' passwords are not reset here: that needs an identity check at the hall (docs/mobile.md)."""

import contextlib
import ipaddress
import secrets
import socket

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from . import barangays
from .auth import (
    clear_login_failures,
    get_current_user,
    hash_password,
    password_problem,
    rate_limit,
    require_csrf,
    require_role,
)
from .db import get_db
from .models import Barangay, LoginSession, Report, ReportPhotoView, User, now, utc_iso

router = APIRouter(prefix="/admin")
ROLES = ("staff", "administrator")
# No 0/o or 1/l/i, so a temporary password can be read off a screen.
PASSWORD_LETTERS = "23456789abcdefghjkmnpqrstuvwxyz"
PASSWORD_LENGTH = 16


def temporary_password(email: str) -> str:
    while True:
        password = "".join(secrets.choice(PASSWORD_LETTERS) for _ in range(PASSWORD_LENGTH))
        if not password_problem(password, email):
            return password


def staff_data(account: User) -> dict:
    return {
        "id": account.id,
        "email": account.email,
        "role": account.role,
        "barangay": account.barangay.name if account.barangay_id else None,
        "disabled": bool(account.disabled_at),
        "must_change_password": bool(account.must_change_password),
    }


def staff_account(db: Session, account_id: str) -> User:
    account = db.get(User, account_id)
    if not account or account.role not in ROLES:
        raise HTTPException(404, "Account not found")
    return account


def barangay_id_named(db: Session, name: str | None, role: str) -> str | None:
    """The account's barangay: administrators see all of them, and staff need one once any are loaded."""
    if role == "administrator":
        if name:
            raise HTTPException(422, "Administrators see every barangay, so they do not belong to one")
        return None
    if not name:
        if barangays.active(db):
            raise HTTPException(422, "Staff need a barangay")
        return None
    barangay_id = db.scalar(select(Barangay.id).where(Barangay.name == name))
    if not barangay_id:
        raise HTTPException(422, "No barangay with that name")
    return barangay_id


def sign_out(db: Session, account_id: str) -> None:
    db.execute(delete(LoginSession).where(LoginSession.user_id == account_id))


class StaffInput(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    role: str
    barangay: str | None = Field(default=None, max_length=120)


class StaffChange(BaseModel):
    barangay: str | None = Field(default=None, max_length=120)
    disabled: bool | None = None


@router.get("/staff")
def list_staff(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_role(user, {"administrator"})
    query = select(User).options(joinedload(User.barangay)).where(User.role.in_(ROLES)).order_by(User.email)
    return [staff_data(account) for account in db.scalars(query)]


@router.post("/staff", status_code=201)
def create_staff(body: StaffInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)):
    require_role(user, {"administrator"})
    rate_limit(request, "admin_staff", key=user.id)
    if body.role not in ROLES:
        raise HTTPException(422, "Choose staff or administrator")
    email = body.email.strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    barangay_id = barangay_id_named(db, body.barangay, body.role)
    password = temporary_password(email)
    account = User(
        email=email,
        password_hash=hash_password(password),
        role=body.role,
        barangay_id=barangay_id,
        must_change_password=True,
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already registered") from None
    db.refresh(account)
    return {**staff_data(account), "temporary_password": password}


@router.patch("/staff/{account_id}")
def change_staff(
    account_id: str,
    body: StaffChange,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_csrf),
):
    """Disabling takes effect on the account's next request. Enabling lets it sign in again; it restores no session."""
    require_role(user, {"administrator"})
    rate_limit(request, "admin_staff", key=user.id)
    account = staff_account(db, account_id)
    if "barangay" in body.model_fields_set:
        account.barangay_id = barangay_id_named(db, body.barangay, account.role)
    if body.disabled is not None:
        if body.disabled and account.id == user.id:
            raise HTTPException(409, "You can't disable your own account")
        account.disabled_at = now() if body.disabled else None
        if body.disabled:
            sign_out(db, account.id)
    db.commit()
    db.refresh(account)
    return staff_data(account)


@router.post("/staff/{account_id}/reset-password")
def reset_staff_password(
    account_id: str, request: Request, db: Session = Depends(get_db), user: User = Depends(require_csrf)
):
    """Signs the account out everywhere. The new password is in this answer only."""
    require_role(user, {"administrator"})
    rate_limit(request, "admin_staff", key=user.id)
    account = staff_account(db, account_id)
    if account.id == user.id:
        raise HTTPException(409, "Use change password for your own account")
    password = temporary_password(account.email)
    account.password_hash = hash_password(password)
    account.must_change_password = True
    sign_out(db, account.id)
    clear_login_failures(db, account.email)
    db.commit()
    return {"temporary_password": password}


def lan_addresses() -> list[str]:
    """This computer's private network addresses, the one with the outgoing route first: virtual adapters such as WSL's
    come last. Connecting a UDP socket sends nothing; it only asks the system which address it would use."""
    found = []
    with contextlib.suppress(OSError), socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.connect(("192.0.2.1", 9))
        found.append(probe.getsockname()[0])
    with contextlib.suppress(OSError):
        found += [info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
    addresses = []
    for address in found:
        ip = ipaddress.ip_address(address)
        if ip.is_private and not ip.is_loopback and not ip.is_link_local and address not in addresses:
            addresses.append(address)
    return addresses


def accepts_connections(address: str, port: int) -> bool:
    """False while the server is bound to this computer only (started without -Lan). A firewall can still stop phones."""
    try:
        with socket.create_connection((address, port), timeout=0.3):
            return True
    except OSError:
        return False


@router.get("/server-address")
def server_address(request: Request, user: User = Depends(get_current_user)):
    """The address residents' phones use to reach this computer. Uses the port the server itself listens on, never the
    Host header a caller sent."""
    require_role(user, {"administrator"})
    server = request.scope.get("server")
    port = server[1] if server and server[1] else 80
    return {
        "addresses": [
            {"url": f"http://{address}:{port}", "listening": accepts_connections(address, port)}
            for address in lan_addresses()
        ]
    }


@router.get("/barangays")
def list_barangays(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_role(user, {"administrator"})
    return [{"id": item.id, "name": item.name} for item in db.scalars(select(Barangay).order_by(Barangay.name))]


@router.get("/reports/{report_id}/photo-views")
def photo_views(report_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Which staff accounts opened a report's photos, and when (at most one row per person and hour)."""
    require_role(user, {"administrator"})
    if not db.get(Report, report_id):
        raise HTTPException(404, "Report not found")
    views = db.scalars(
        select(ReportPhotoView)
        .where(ReportPhotoView.report_id == report_id)
        .order_by(ReportPhotoView.created_at.desc())
    )
    return [{"actor_id": item.actor_id, "created_at": utc_iso(item.created_at)} for item in views]
