"""A resident's data download, the erasure ledger across restores, metrics, and how the laptop is run."""

import json
import logging
import logging.config
import os
import sqlite3
import subprocess
import sys
import tomllib
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from conftest import register
from test_barangays import account
from test_cases import PASSWORD, headers, login, resident_report, walk
from test_reports import submit
from test_workflow import staff_login

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / "apps" / "api"


def database_path():
    return Path(os.environ["DATABASE_URL"].removeprefix("sqlite:///"))


def media_files():
    folder = Path(os.environ["PRIVATE_MEDIA_DIR"])
    return sorted(path.name for path in folder.iterdir()) if folder.is_dir() else []


# Data download


def test_a_resident_downloads_their_own_data_and_nothing_internal(client, photo):
    from barangai.db import session_for_url
    from barangai.models import PointEntry, Report, User

    report = resident_report(client, photo, "ana@example.test", description="Synthetic flooded lane")
    other = resident_report(client, photo, "ben@example.test")
    login(client, "ana@example.test")
    client.post(f"/reports/{report}/addenda", data={"note": "Synthetic extra detail"}, headers=headers(client))
    with session_for_url() as db:
        db.get(Report, report).trust_flags = [{"code": "old_photo", "detail": 9}]
        db.commit()
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    client.post(
        f"/reports/{report}/actions",
        json={"kind": "coordination", "note": "SECRET outside office"},
        headers=headers(client),
    )
    client.post(f"/reports/{report}/actions", json={"kind": "action", "note": "Crew sent"}, headers=headers(client))

    assert client.get("/auth/export").status_code == 403  # Staff aren't residents.
    login(client, "ana@example.test")
    answer = client.get("/auth/export")
    assert answer.status_code == 200 and "attachment" in answer.headers["content-disposition"]
    data = answer.json()
    assert data["account"]["email"] == "ana@example.test" and data["account"]["terms_accepted_at"]
    assert data["report_ids"] == [report] and other not in answer.text
    item = data["reports"][0]
    assert item["description"] == "Synthetic flooded lane"
    assert [event["to_status"] for event in item["events"]] == ["Pending", "Under Verification", "Accepted"]
    assert item["events"][1]["note"] == "Synthetic status note"
    assert [entry["note"] for entry in item["addenda"]] == ["Synthetic extra detail"]
    assert [action["note"] for action in item["actions"]] == ["Crew sent"]
    assert data["points"]["balance"] == 25 and [row["kind"] for row in data["points"]["history"]] == ["accepted"]
    assert data["vouchers"] == {"available": [], "history": []}

    with session_for_url() as db:
        staff = db.query(User).filter_by(email="staff@example.test").one().id
    text = answer.text
    assert staff not in text and "SECRET" not in text and "trust_flags" not in text and "actor_id" not in text
    assert "priority" not in text and "image_embedding" not in text and "password" not in text
    # Nothing else in the database is part of it.
    with session_for_url() as db:
        assert db.query(PointEntry).count() == 1


def test_the_download_needs_a_sign_in_and_is_rate_limited(client):
    assert client.get("/auth/export").status_code == 401
    register(client, "ana@example.test")
    answers = [client.get("/auth/export").status_code for _ in range(6)]
    assert answers[:5] == [200] * 5 and answers[5] == 429


# Erasure ledger


def stop_and_restore(client, folder, **options):
    from barangai import backup

    client.close()
    return backup.restore_backup(folder, **options)


def delete_account(client, email):
    login(client, email)
    answer = client.post("/auth/delete-account", json={"email": email, "password": PASSWORD}, headers=headers(client))
    assert answer.status_code == 204, answer.text


def erased_rows():
    with closing(sqlite3.connect(database_path())) as connection:
        return set(connection.execute("SELECT kind, subject_id FROM erasures"))


def test_restoring_an_old_backup_cannot_bring_erased_data_back(client, photo, tmp_path):
    from barangai import backup
    from barangai.bootstrap_staff import create_staff
    from barangai.db import session_for_url
    from barangai.delete_report import delete_report
    from barangai.models import User

    gone = resident_report(client, photo, "gone@example.test", description="Erased with its account")
    requested = resident_report(client, photo, "ana@example.test", description="Erased on request")
    by_operator = resident_report(client, photo, "ana@example.test", description="Erased by the operator")
    kept = resident_report(client, photo, "ana@example.test", description="Stays")
    with session_for_url() as db:
        gone_user = db.query(User).filter_by(email="gone@example.test").one().id
    folder = backup.create_backup(tmp_path / "offsite")
    assert sorted(media_files()) == sorted(f"{item}.jpg" for item in (gone, requested, by_operator, kept))

    delete_account(client, "gone@example.test")
    login(client, "ana@example.test")
    assert client.post(f"/reports/{requested}/deletion-request", json={}, headers=headers(client)).status_code == 201
    staff_login(client)
    answer = client.post(
        f"/reports/{requested}/deletion-request/decision", json={"decision": "approved"}, headers=headers(client)
    )
    assert answer.status_code == 200
    create_staff("boss@example.test", "a-synthetic-desk-phrase", "administrator")
    delete_report(
        by_operator,
        "boss@example.test",
        "a-synthetic-desk-phrase",
        confirm=by_operator,
        reason="resident-request",
        receipt_path=tmp_path / "receipts.jsonl",
    )
    ledger = erased_rows()
    assert ledger == {
        ("user", gone_user),
        ("report", gone),
        ("report", requested),
        ("report", by_operator),
    }

    restored = stop_and_restore(client, folder, replace=True)
    assert restored["reerased"] == {"reports": 0 + 3, "users": 1, "photos": 3}
    assert restored["erasure_ledger"] == "current database and backup"
    assert restored["counts"]["reports"] == 1
    assert media_files() == [f"{kept}.jpg"]
    # The ledger survives into the restored database, so the next restore holds too.
    assert erased_rows() == ledger
    assert list(database_path().parent.glob("*.before-*")) == []  # No copy holding what was just erased.
    raw = database_path().read_bytes()
    assert b"gone@example.test" not in raw and b"Erased on request" not in raw and b"Erased by the operator" not in raw


def test_a_new_laptop_uses_the_backups_own_ledger(client, photo, tmp_path, monkeypatch):
    from barangai import backup

    report = resident_report(client, photo, "ana@example.test")
    kept = resident_report(client, photo, "ben@example.test")
    folder = backup.create_backup(tmp_path / "offsite")
    # An erasure recorded in the backup while the row is still in it (an earlier restore stopped half way).
    with closing(sqlite3.connect(folder / backup.DATABASE_NAME)) as connection, connection:
        connection.execute(
            "INSERT INTO erasures (kind, subject_id, created_at) VALUES ('report', ?, '2026-11-04 00:00:00')", (report,)
        )
    new_home = tmp_path / "new laptop"
    new_home.mkdir()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(new_home / 'barangai.db').as_posix()}")
    monkeypatch.setenv("PRIVATE_MEDIA_DIR", str(new_home / "photos"))
    # The manifest counted the report; the restore must still accept the backup.
    restored = backup.restore_backup(folder)
    assert restored["erasure_ledger"] == "backup only"
    assert restored["reerased"]["reports"] == 1 and restored["counts"]["reports"] == 1
    assert media_files() == [f"{kept}.jpg"]


def test_a_backup_older_than_the_ledger_is_still_cleaned(client, photo, tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from barangai import backup

    report = resident_report(client, photo, "gone@example.test")
    folder = backup.create_backup(tmp_path / "offsite")
    live_url = os.environ["DATABASE_URL"]
    config = Config()
    config.set_main_option("script_location", str(API / "migrations"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(folder / backup.DATABASE_NAME).as_posix()}")
    command.downgrade(config, "0012")
    monkeypatch.setenv("DATABASE_URL", live_url)
    assert backup.erased_ids(folder / backup.DATABASE_NAME) == set()

    delete_account(client, "gone@example.test")
    restored = stop_and_restore(client, folder, replace=True)
    assert restored["reerased"]["reports"] == 1 and restored["reerased"]["users"] == 1
    assert restored["counts"]["users"] == 0 and media_files() == []
    assert ("report", report) in erased_rows()


def test_nothing_erased_means_nothing_touched(client, photo, tmp_path):
    from barangai import backup

    resident_report(client, photo, "ana@example.test")
    folder = backup.create_backup(tmp_path / "offsite")
    restored = stop_and_restore(client, folder, replace=True)
    assert restored["reerased"] == {"reports": 0, "users": 0, "photos": 0} and restored["counts"]["reports"] == 1


def test_the_ledger_holds_only_ids(client, photo):
    from barangai.db import session_for_url
    from barangai.models import Erasure

    resident_report(client, photo, "ana@example.test", description="Synthetic words")
    delete_account(client, "ana@example.test")
    with session_for_url() as db:
        rows = db.query(Erasure).all()
        assert {row.kind for row in rows} == {"user", "report"}
        assert all(len(row.subject_id) == 36 for row in rows)
    raw = b"".join(path.read_bytes() for path in database_path().parent.glob(f"{database_path().name}*"))
    assert b"ana@example.test" not in raw


def test_restoring_points_at_the_same_commands(client, photo, tmp_path, capsys):
    from barangai import backup

    resident_report(client, photo, "ana@example.test")
    folder = backup.create_backup(tmp_path / "offsite")
    client.close()
    assert backup.main(["restore", str(folder), "--replace"]) == 0
    assert json.loads(capsys.readouterr().out)["reerased"]["reports"] == 0


# Demo accounts on the network


def seed_env(
    monkeypatch, resident="resident-phrase-for-demo", staff="staff-phrase-for-demo", admin="admin-phrase-for-demo"
):
    monkeypatch.setenv("SEED_DEMO_PASSWORD", resident)
    monkeypatch.setenv("SEED_DEMO_STAFF_PASSWORD", staff)
    monkeypatch.setenv("SEED_DEMO_ADMIN_PASSWORD", admin)
    return resident, staff, admin


def test_each_demo_role_has_its_own_password(client, monkeypatch, capsys):
    from barangai.seed_demo import seed

    resident, staff, admin = seed_env(monkeypatch)
    seed(resident, 1, staff, admin)
    assert capsys.readouterr().out == ""  # Nothing to show: they came from the environment.
    for email, password in (
        ("resident1@demo.test", resident),
        ("staff@demo.test", staff),
        ("admin@demo.test", admin),
    ):
        login(client, email, password)
    for email in ("staff@demo.test", "admin@demo.test"):
        answer = client.post("/auth/login", json={"email": email, "password": resident})
        assert answer.status_code == 401


def test_demo_staff_passwords_are_generated_and_shown_once_when_not_given(client, monkeypatch, capsys):
    from barangai.seed_demo import seed

    for name in ("SEED_DEMO_STAFF_PASSWORD", "SEED_DEMO_ADMIN_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    seed("resident-phrase-for-demo", 0)
    printed = dict(line.split(": ") for line in capsys.readouterr().out.strip().splitlines())
    assert set(printed) == {"staff@demo.test", "admin@demo.test"}
    assert len(set(printed.values())) == 2 and "resident-phrase-for-demo" not in printed.values()
    login(client, "admin@demo.test", printed["admin@demo.test"])
    # A second run keeps the accounts, so it has nothing to show.
    seed("resident-phrase-for-demo", 0)
    assert capsys.readouterr().out == ""
    login(client, "admin@demo.test", printed["admin@demo.test"])


def test_one_password_for_two_roles_is_refused(client):
    from barangai.seed_demo import seed

    with pytest.raises(ValueError, match="its own"):
        seed("resident-phrase-for-demo", 0, "resident-phrase-for-demo", "admin-phrase-for-demo")


def test_the_lan_check_refuses_demo_staff_unless_told_it_is_a_demo(client, capsys):
    from barangai.lan_check import main

    assert main([]) == 0
    account("ana@demo.test", "resident")  # A demo resident can only see their own reports.
    assert main([]) == 0
    account("staff@demo.test", "staff")
    assert main([]) == 1
    assert "-Demo" in capsys.readouterr().out
    assert main(["--demo"]) == 0


def test_the_lan_check_creates_no_database(monkeypatch, tmp_path):
    from barangai.lan_check import main

    target = tmp_path / "none.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{target.as_posix()}")
    assert main([]) == 0
    assert not target.exists()


def test_the_launcher_runs_the_check_only_for_the_network():
    launcher = (ROOT / "deploy" / "start-local.ps1").read_text(encoding="utf-8")
    assert "[switch]$Demo" in launcher and "barangai.lan_check" in launcher
    start = launcher.index("barangai.lan_check")
    assert "if ($Lan)" in launcher[:start]
    assert launcher.index("$env:DATABASE_URL") < start < launcher.index("barangai.main:app")


# Metrics


def test_metrics_measure_follow_through_without_naming_anyone(client, photo, capsys):
    from barangai.db import session_for_url
    from barangai.metrics import compute, main
    from barangai.models import Report, ReportEvent, User

    now = datetime.now(UTC)
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo).json()["id"]
    lonely = resident_report(client, photo, "ben@example.test")
    resident_report(client, photo, "late@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted", "In Progress", "Resolved")
    with session_for_url() as db:
        ana = db.query(User).filter_by(email="ana@example.test").one()
        ben = db.query(User).filter_by(email="ben@example.test").one()
        late = db.query(User).filter_by(email="late@example.test").one()
        ana.terms_accepted_at = now - timedelta(days=20)
        ben.terms_accepted_at = now - timedelta(days=20)
        late.terms_accepted_at = now - timedelta(days=20)
        report = db.get(Report, first)
        report.created_at = now - timedelta(days=19)
        for event in db.query(ReportEvent).filter_by(report_id=first).all():
            hours = {None: 0, "Pending": 2, "Under Verification": 4, "Accepted": 6, "In Progress": 30}[
                event.from_status
            ]
            event.created_at = report.created_at + timedelta(hours=hours)
        db.get(Report, second).created_at = now - timedelta(days=18)
        db.get(Report, lonely).created_at = now - timedelta(days=18)
        db.query(Report).filter_by(resident_id=late.id).one().created_at = now - timedelta(days=9)
        db.commit()
        result = compute(db, 30, at=now)
    assert result["reports"] == 4
    assert result["first_response"] == {"measured": 1, "median_hours": 2.0}
    assert result["time_to_accept"] == {"measured": 1, "median_hours": 4.0}
    assert result["time_to_resolve"] == {"measured": 1, "median_hours": 30.0}
    assert result["response_within_7_days"] == {"count": 1, "of": 4, "percent": 25}
    assert result["activation_7_days"] == {"count": 2, "of": 3, "percent": 67}

    # Sixty days on, one of three came back within the window.
    with session_for_url() as db:
        result = compute(db, 30, at=now + timedelta(days=60))
    assert result["second_report_60_days"] == {"count": 1, "of": 3, "percent": 33}

    assert main(["--days", "30"]) == 0
    output = capsys.readouterr().out
    assert "Monthly report use: not tracked" in output
    assert "@" not in output and first not in output


def test_metrics_leave_demo_accounts_out(client, photo):
    from barangai.db import session_for_url
    from barangai.metrics import compute

    resident_report(client, photo, "ana@demo.test")
    with session_for_url() as db:
        assert compute(db)["reports"] == 0
        assert compute(db, include_demo=True)["reports"] == 1


def test_metrics_cope_with_an_empty_database(client):
    from barangai.db import session_for_url
    from barangai.metrics import compute, describe

    with session_for_url() as db:
        assert "no one to measure yet" in describe(compute(db))


# Packaging


def test_the_postgres_driver_is_an_optional_extra():
    project = tomllib.loads((API / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    assert not [item for item in project["dependencies"] if "psycopg" in item]
    assert [item for item in project["optional-dependencies"]["postgres"] if "psycopg2" in item]
    assert ".[postgres]" in (ROOT / "deploy" / "Dockerfile.render").read_text(encoding="utf-8")


def test_the_api_starts_without_the_postgres_driver(tmp_path):
    script = (
        "import sys\n"
        "sys.modules['psycopg2'] = None\n"
        "from barangai.main import create_app\n"
        "from fastapi.testclient import TestClient\n"
        "with TestClient(create_app()) as client:\n"
        "    assert client.get('/health').status_code == 200\n"
    )
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{(tmp_path / 'base.db').as_posix()}",
        "PRIVATE_MEDIA_DIR": str(tmp_path / "photos"),
    }
    subprocess.run([sys.executable, "-c", script], check=True, env=env, cwd=API, capture_output=True, timeout=60)


def test_ci_audits_both_dependency_sets():
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert "pip-audit" in workflow and "constraints-render.txt" in workflow and "npm audit" in workflow


# Logging


@pytest.fixture
def restore_logging():
    root = logging.getLogger()
    names = ("", "barangai", "uvicorn", "uvicorn.error", "uvicorn.access", "httpx")
    saved = {name: (logging.getLogger(name).handlers[:], logging.getLogger(name).level) for name in names}
    yield root
    for name, (handlers, level) in saved.items():
        for handler in logging.getLogger(name).handlers:
            if handler not in handlers:
                handler.close()
        logging.getLogger(name).handlers[:] = handlers
        logging.getLogger(name).setLevel(level)


def test_failures_reach_the_rotating_log_and_request_lines_dont(tmp_path, monkeypatch, restore_logging):
    # As the launcher runs it: from apps/api, with logs/ in the repo root.
    (tmp_path / "logs").mkdir()
    working = tmp_path / "apps" / "api"
    working.mkdir(parents=True)
    monkeypatch.chdir(working)
    config = json.loads((ROOT / "deploy" / "uvicorn-logging.json").read_text(encoding="utf-8"))
    logging.config.dictConfig(config)
    logging.getLogger("uvicorn.error").error("Synthetic server failure")
    logging.getLogger("barangai.reports").warning("Synthetic app warning")
    logging.getLogger("barangai.accounts").info("Synthetic app note")
    logging.getLogger("httpx").info("HTTP Request: GET https://nominatim.example/reverse?lat=14.3&lon=120.9")
    logging.getLogger("uvicorn.access").info(
        '%s - "%s %s HTTP/%s" %d', "10.0.0.5", "GET", "/api/nearby?latitude=14.3", "1.1", 200
    )
    for handler in logging.getLogger().handlers:
        handler.flush()
    written = (tmp_path / "logs" / "barangai.log").read_text(encoding="utf-8")
    assert (
        "Synthetic server failure" in written and "Synthetic app warning" in written and "Synthetic app note" in written
    )
    # Addresses, pins and report ids stay out of a file that outlives the window.
    assert "10.0.0.5" not in written and "latitude" not in written and "lat=" not in written
    handler = next(
        item for item in logging.getLogger().handlers if isinstance(item, logging.handlers.RotatingFileHandler)
    )
    assert handler.maxBytes and handler.backupCount


def test_logs_are_not_committed_and_the_launcher_uses_the_config():
    assert "logs/" in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    launcher = (ROOT / "deploy" / "start-local.ps1").read_text(encoding="utf-8")
    assert "--log-config" in launcher and "uvicorn-logging.json" in launcher


def test_a_failed_restore_puts_everything_back_and_keeps_the_ledger(client, photo, tmp_path, monkeypatch):
    from barangai import backup, delete_report

    gone = resident_report(client, photo, "gone@example.test")
    folder = backup.create_backup(tmp_path / "offsite")
    delete_account(client, "gone@example.test")
    ledger = erased_rows()
    assert ("report", gone) in ledger
    client.close()

    def broken(*_args, **_kwargs):
        raise RuntimeError("Synthetic failure part way through")

    with monkeypatch.context() as patch:
        patch.setattr(delete_report, "erase_account", broken)
        patch.setattr(delete_report, "erase_rows", broken)
        with pytest.raises(RuntimeError, match="Synthetic"):
            backup.restore_backup(folder, replace=True)
    assert erased_rows() == ledger
    assert not list(database_path().parent.glob("*.replaced-*"))
    assert media_files() == []  # No photo came back either.

    restored = backup.restore_backup(folder, replace=True)
    assert restored["reerased"]["users"] == 1 and restored["counts"]["users"] == 0
    assert media_files() == [] and erased_rows() == ledger


def test_an_unreadable_ledger_stops_the_restore(tmp_path):
    from barangai import backup

    broken = tmp_path / "broken.db"
    broken.write_bytes(b"this is not a database, and it is long enough to be read as one" * 40)
    with pytest.raises(ValueError, match="erasure ledger"):
        backup.erased_ids(broken)


def test_database_errors_do_not_quote_the_rows_values(client):
    from barangai.db import database_url, engine_for_url
    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError

    with engine_for_url(database_url()).connect() as connection:
        with pytest.raises(SQLAlchemyError) as failure:
            connection.execute(text("INSERT INTO no_such_table VALUES (:email)"), {"email": "ana@example.test"})
    assert "ana@example.test" not in str(failure.value)
