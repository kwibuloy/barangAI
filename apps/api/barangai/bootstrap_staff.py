import argparse
from getpass import getpass

from sqlalchemy import select

from .auth import hasher
from .db import session_for_url
from .models import Barangay, User


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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a staff or administrator account, or move staff to a barangay")
    parser.add_argument("email")
    parser.add_argument("--role", choices=["staff", "administrator"], default="staff")
    parser.add_argument("--barangay", help="Barangay name, required for staff once barangays are loaded")
    parser.add_argument("--assign", action="store_true", help="Move an existing staff account to --barangay")
    args = parser.parse_args()
    if args.assign:
        if not args.barangay:
            parser.error("--assign needs --barangay")
        assign_barangay(args.email, args.barangay)
    else:
        create_staff(args.email, getpass("Password: "), args.role, args.barangay)
