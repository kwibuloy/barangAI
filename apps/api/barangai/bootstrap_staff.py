import argparse
from getpass import getpass

from sqlalchemy import delete, select

from .auth import clear_login_failures, hasher, password_problem
from .db import session_for_url
from .models import Barangay, LoginSession, User, now


def find_barangay(db, name: str) -> Barangay:
    barangay = db.scalar(select(Barangay).where(Barangay.name == name))
    if not barangay:
        raise ValueError(f"No barangay named {name}")
    return barangay


def create_staff(email: str, password: str, role: str, barangay: str | None = None):
    if role not in {"staff", "administrator"} or len(password) < 12:
        raise ValueError("Valid role and a password of at least 12 characters required")
    if role == "administrator" and barangay:
        raise ValueError("Administrators see every barangay, so they do not belong to one")
    if problem := password_problem(password, email):
        raise ValueError(problem)
    with session_for_url() as db:
        if db.scalar(select(User).where(User.email == email.lower())):
            raise ValueError("Email already exists")
        if role == "staff" and not barangay and db.scalar(select(Barangay.id).limit(1)):
            raise ValueError("Staff need a barangay: pass --barangay")
        barangay_id = find_barangay(db, barangay).id if barangay else None
        db.add(User(email=email.lower(), password_hash=hasher.hash(password), role=role, barangay_id=barangay_id))
        db.commit()


def assign_barangay(email: str, barangay: str):
    with session_for_url() as db:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if not user or user.role != "staff":
            raise ValueError("No staff account with that email")
        user.barangay_id = find_barangay(db, barangay).id
        db.commit()


def reset_password(email: str, password: str):
    """For someone who forgot their password: the site sends no email, so an administrator runs this. Whoever types it
    has seen it, so staff and administrators, who hold residents' data, must choose their own at next sign-in."""
    if len(password) < 12:
        raise ValueError("A password of at least 12 characters required")
    if problem := password_problem(password, email):
        raise ValueError(problem)
    with session_for_url() as db:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if not user:
            raise ValueError("No account with that email")
        user.password_hash = hasher.hash(password)
        if user.role != "resident":
            user.must_change_password = True
        db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
        clear_login_failures(db, user.email)
        db.commit()


def set_disabled(email: str, disabled: bool):
    """Any account, residents included: bans an abuser or stops a former official on the next request. Staff and
    administrators can also be managed through the API (admin.py)."""
    with session_for_url() as db:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if not user:
            raise ValueError("No account with that email")
        user.disabled_at = now() if disabled else None
        if disabled:
            db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
        db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a staff or administrator account, move staff to a barangay, or reset a password")
    parser.add_argument("email")
    parser.add_argument("--role", choices=["staff", "administrator"], default="staff")
    parser.add_argument("--barangay", help="Barangay name, required for staff once barangays are loaded")
    parser.add_argument("--assign", action="store_true", help="Move an existing staff account to --barangay")
    parser.add_argument("--reset-password", action="store_true", help="Set a new password and sign the account out")
    parser.add_argument("--disable", action="store_true", help="Sign the account out and refuse its sign-ins")
    parser.add_argument("--enable", action="store_true", help="Let a disabled account sign in again")
    args = parser.parse_args()
    if args.disable or args.enable:
        set_disabled(args.email, args.disable)
    elif args.reset_password:
        reset_password(args.email, getpass("New password: "))
    elif args.assign:
        if not args.barangay:
            parser.error("--assign needs --barangay")
        assign_barangay(args.email, args.barangay)
    else:
        create_staff(args.email, getpass("Password: "), args.role, args.barangay)
