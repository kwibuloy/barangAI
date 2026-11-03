"""Limits counted in the database, so a restart or Render's sleep does not reset them.

The per-minute limits in auth.py stop bursts; these protect what is scarce over a longer time: Cloudflare's free
daily allowance, the photo bucket and the accounts themselves. Each limit has a setting (see .env.example).
"""

import os
from datetime import timedelta, timezone

from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Usage, now

MANILA = timezone(timedelta(hours=8))


def limit_setting(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


def period_key(name: str, hourly: bool = False) -> str:
    return f"{name}:{now().astimezone(MANILA).strftime('%Y-%m-%dT%H' if hourly else '%Y-%m-%d')}"


def take(db: Session, key: str, limit: int) -> bool:
    """Counts one use and returns True, or False once the limit is reached. Commits, so the count survives whatever
    the request does next and other requests see it at once."""
    for _ in range(2):
        counted = db.execute(update(Usage).where(Usage.key == key, Usage.count < limit).values(count=Usage.count + 1))
        if counted.rowcount:
            db.commit()
            return True
        if db.get(Usage, key):
            db.rollback()
            return False
        # First use in this period: old periods are finished with.
        db.execute(delete(Usage).where(Usage.created_at < now() - timedelta(days=3)))
        db.add(Usage(key=key, count=1))
        try:
            db.commit()
            return True
        except IntegrityError:
            db.rollback()  # Another request started the period first; count on its row.
    return False
