import os
from functools import lru_cache
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    pass


@lru_cache(maxsize=8)
def engine_for_url(url):
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    options = {"pool_pre_ping": True}
    if make_url(url).get_backend_name() == "postgresql":
        # One demo worker uses at most five database connections.
        options.update(pool_size=3, max_overflow=2)
    return create_engine(url, **options)


def database_url():
    url = os.environ.get("DATABASE_URL", "sqlite:///./barangai-dev.db")
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def upgrade_sqlite():
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


def session_for_url():
    return Session(engine_for_url(database_url()))


def get_db():
    with session_for_url() as db:
        yield db
