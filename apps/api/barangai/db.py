import logging
import os
import sqlite3
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    pass


def project_root():
    """The repo root, where the launcher keeps the database and photos, whichever folder a command runs from."""
    parents = Path(__file__).resolve().parents
    return parents[min(3, len(parents) - 1)]


def demo_mode() -> bool:
    """DEMO_MODE=true: this server holds synthetic data, and every screen and printed report says so. Off by default."""
    return os.environ.get("DEMO_MODE", "").strip().lower() == "true"


def _sqlite_settings(connection, _record):
    """Per connection: readers never block a commit, foreign keys hold, and deleted rows leave no bytes behind."""
    cursor = connection.cursor()
    for pragma in ("journal_mode=WAL", "foreign_keys=ON", "busy_timeout=5000", "secure_delete=ON"):
        cursor.execute(f"PRAGMA {pragma}")
    cursor.close()


@lru_cache(maxsize=8)
def engine_for_url(url):
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    # hide_parameters: a database error's text would otherwise quote the row's values, and errors reach the log file.
    options = {"pool_pre_ping": True, "hide_parameters": True}
    if make_url(url).get_backend_name() == "postgresql":
        # One demo worker uses at most five database connections.
        options.update(pool_size=3, max_overflow=2)
    is_sqlite = make_url(url).get_backend_name() == "sqlite"
    if is_sqlite and make_url(url).database not in {None, "", ":memory:"}:
        # At least one connection per server thread (40). With fewer, a burst of requests holds connections while
        # waiting for threads and the server stalls for the 30-second pool timeout.
        options.update(pool_size=45, max_overflow=15, pool_timeout=10)
    engine = create_engine(url, **options)
    if is_sqlite:
        event.listen(engine, "connect", _sqlite_settings)
    return engine


def database_url():
    url = os.environ.get("DATABASE_URL") or f"sqlite:///{(project_root() / 'barangai-dev.db').as_posix()}"
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def upgrade_sqlite(keep_copy=True):
    """Bring a local SQLite database to the migration head, so dev and tests use the deployed schema."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    from . import models  # noqa: F401  Register tables for the legacy check below.

    if make_url(database_url()).get_backend_name() != "sqlite":
        raise RuntimeError("upgrade_sqlite is for local SQLite only; deployed databases run alembic upgrade head")
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    inspector = inspect(engine_for_url(database_url()))
    tables = set(inspector.get_table_names())
    if "alembic_version" in tables or not tables:
        if tables and keep_copy:
            copy_before_upgrade(config)
        command.upgrade(config, "head")
        return
    # Created by the old create_all start-up, which never added columns to existing tables.
    current = all(
        name in tables and {c.name for c in table.columns} <= {c["name"] for c in inspector.get_columns(name)}
        for name, table in Base.metadata.tables.items()
    )
    if not current:
        raise RuntimeError(f"{database_url()} predates migrations and its schema is out of date; delete it and restart")
    command.stamp(config, "head")


def copy_before_upgrade(config):
    """SQLite schema changes are not all-or-nothing, so keep a copy of the database before changing the only one."""
    from alembic.script import ScriptDirectory

    head = ScriptDirectory.from_config(config).get_current_head()
    with engine_for_url(database_url()).connect() as connection:
        current = connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar()
    source = make_url(database_url()).database
    if current == head or not source or source == ":memory:":
        return
    target = Path(source).with_name(f"{Path(source).stem}.before-{head}-{datetime.now():%Y%m%d-%H%M%S}.db")
    copy_sqlite(source, target)


def copy_sqlite(source, target):
    """A consistent copy of a live database, including what is still in its write-ahead log."""
    origin, copy = sqlite3.connect(source), sqlite3.connect(target)
    try:
        origin.backup(copy)
    finally:
        copy.close()
        origin.close()


def scrub_deleted(db):
    """After a privacy deletion, empties SQLite's write-ahead log so the database files no longer hold the erased rows.
    This can't wipe the disk blocks underneath. If a long reader holds the log, SQLite's next checkpoint clears it."""
    if db.get_bind().dialect.name == "sqlite":
        busy = db.connection().exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)").first()[0]
        db.commit()
        if busy:
            logging.getLogger(__name__).warning("Deleted rows stay in the write-ahead log until the next checkpoint")


def session_for_url():
    return Session(engine_for_url(database_url()))


def get_db():
    with session_for_url() as db:
        yield db
