"""Run by the launcher before serving a whole network (-Lan): refuses a database with demo staff accounts.

Their passwords may be shared around, so anyone on the Wi-Fi could open the staff desk. Real use needs a fresh database,
and a synthetic demo says so by passing --demo.
"""

import argparse
from pathlib import Path

from sqlalchemy import func, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from .db import database_url, engine_for_url
from .models import User


def demo_staff_accounts() -> int:
    url = make_url(database_url())
    # A database that doesn't exist yet has no accounts, and looking must not create it.
    if url.get_backend_name() == "sqlite" and (not url.database or not Path(url.database).is_file()):
        return 0
    engine = engine_for_url(database_url())
    if not inspect(engine).has_table("users"):
        return 0
    with Session(engine) as db:
        return db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role.in_(("staff", "administrator")), User.email.like("%@demo.test"))
        )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="This is a synthetic demo: allow demo staff accounts")
    args = parser.parse_args(argv)
    found = demo_staff_accounts()
    if found and args.demo:
        print(f"Demo mode: {found} demo staff or administrator accounts can sign in. Synthetic data only.")
    elif found:
        print(
            f"Refusing to start for the network: this database has {found} demo staff or administrator accounts. "
            "For a synthetic demo, pass -Demo. For real use, start a fresh database."
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
