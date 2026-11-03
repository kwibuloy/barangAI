import io
from pathlib import Path

from alembic import command
from alembic.config import Config
from barangai.db import database_url, engine_for_url
from sqlalchemy import inspect


def migration_config(output=None):
    config = Config(stdout=output)
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    return config


def test_legacy_postgres_url_and_percent_encoded_password(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://synthetic:p%40ss@localhost/example?sslmode=require")
    assert database_url() == "postgresql://synthetic:p%40ss@localhost/example?sslmode=require"
    engine = engine_for_url(database_url())
    assert engine.url.password == "p@ss"
    assert engine.pool.size() == 3
    engine.dispose()


def test_postgres_migration_sql_protects_every_application_table(monkeypatch):
    from barangai import models  # noqa: F401  (registers the application tables)
    from barangai.db import Base

    monkeypatch.setenv("DATABASE_URL", "postgres://synthetic:p%40ss@localhost/example")
    output = io.StringIO()
    config = migration_config(output)
    config.output_buffer = output
    command.upgrade(config, "head", sql=True)
    sql = output.getvalue()
    for table in (*Base.metadata.tables, "alembic_version"):
        assert f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY' in sql
    assert "CREATE POLICY" not in sql
    assert "FORCE ROW LEVEL SECURITY" not in sql


def test_sqlite_migration_upgrade_and_rollback_keep_existing_data(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'migration.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = migration_config()
    command.upgrade(config, "0003")
    engine = engine_for_url(url)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ("synthetic-user", "synthetic@example.test", "not-a-real-password", "resident"),
        )
    command.upgrade(config, "head")
    command.downgrade(config, "0003")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT email FROM users").scalar_one() == "synthetic@example.test"
    assert "notifications" in inspect(engine).get_table_names()
    engine.dispose()


def test_sqlite_start_up_migrates_or_stamps_legacy_create_all_database(tmp_path, monkeypatch):
    from alembic.script import ScriptDirectory
    from barangai import models  # noqa: F401
    from barangai.db import Base, upgrade_sqlite

    head = ScriptDirectory.from_config(migration_config()).get_current_head()

    for name, legacy in (("fresh.db", False), ("legacy.db", True)):
        monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / name).as_posix()}")
        engine = engine_for_url(database_url())
        if legacy:
            Base.metadata.create_all(engine)
        upgrade_sqlite()
        with engine.connect() as connection:
            assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar() == head
        assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())
        engine.dispose()


def test_sqlite_start_up_refuses_outdated_legacy_database(tmp_path, monkeypatch):
    import pytest
    from barangai import models  # noqa: F401
    from barangai.db import Base, upgrade_sqlite

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    engine = engine_for_url(database_url())
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE reports DROP COLUMN embedding_model_version")
    with pytest.raises(RuntimeError, match="out of date"):
        upgrade_sqlite()
    engine.dispose()
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:x@localhost/example")
    with pytest.raises(RuntimeError, match="SQLite only"):
        upgrade_sqlite()
