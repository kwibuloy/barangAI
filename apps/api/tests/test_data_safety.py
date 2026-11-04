"""The laptop holds the only copy of a barangay's records: nothing may lose, corrupt or leak them."""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from conftest import register
from test_cases import PASSWORD, headers, login, resident_report, walk
from test_reports import submit
from test_workflow import staff_login


def database_path():
    return Path(os.environ["DATABASE_URL"].removeprefix("sqlite:///"))


def media_files():
    folder = Path(os.environ["PRIVATE_MEDIA_DIR"])
    return sorted(path.name for path in folder.iterdir()) if folder.is_dir() else []


def test_importing_the_app_touches_no_database(tmp_path):
    target = tmp_path / "untouched.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{target.as_posix()}"}
    api_folder = Path(__file__).resolve().parents[1]
    subprocess.run([sys.executable, "-c", "import barangai.main"], check=True, env=env, cwd=api_folder)
    assert not target.exists()


def test_the_server_can_still_ask_for_the_app_by_name(client):
    import barangai.main

    assert barangai.main.app is not None
    assert barangai.main.app is barangai.main.app


def test_default_locations_do_not_depend_on_the_current_folder(monkeypatch, tmp_path):
    from barangai.db import database_url, project_root
    from barangai.media import media_dir

    monkeypatch.delenv("DATABASE_URL")
    monkeypatch.delenv("PRIVATE_MEDIA_DIR")
    monkeypatch.chdir(tmp_path)
    assert database_url() == f"sqlite:///{(project_root() / 'barangai-dev.db').as_posix()}"
    assert media_dir() == project_root() / "private_media"


def test_sqlite_connections_use_safe_settings(client):
    from barangai.db import engine_for_url

    engine = engine_for_url(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        read = connection.exec_driver_sql
        assert read("PRAGMA journal_mode").scalar() == "wal"
        assert read("PRAGMA foreign_keys").scalar() == 1
        assert read("PRAGMA busy_timeout").scalar() == 5000
        assert read("PRAGMA secure_delete").scalar() == 1
    assert engine.pool.size() >= 40  # One per server thread, or a burst of requests stalls the server.


def test_upgrading_keeps_a_copy_of_the_database_first(client, photo):
    from alembic import command
    from alembic.config import Config
    from barangai.db import upgrade_sqlite
    from fastapi.testclient import TestClient  # noqa: F401

    resident_report(client, photo, "ana@example.test")
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    command.downgrade(config, "-1")
    before = set(database_path().parent.glob("*.db"))
    upgrade_sqlite()
    copies = set(database_path().parent.glob("*.db")) - before
    assert len(copies) == 1
    copy = sqlite3.connect(copies.pop())
    assert copy.execute("SELECT count(*) FROM reports").fetchone() == (1,)
    copy.close()
    # Nothing to change, so no further copy.
    before = set(database_path().parent.glob("*.db"))
    upgrade_sqlite()
    assert set(database_path().parent.glob("*.db")) == before


def test_backup_survives_losing_the_laptop(client, photo, tmp_path, monkeypatch):
    """Back up, lose everything, restore into a different folder: reports, photos and history are all there."""
    from barangai import backup, media

    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert client.get(f"/reports/{report}/image").status_code == 200

    folder = backup.create_backup(tmp_path / "offsite")
    assert (folder / "photos" / f"{report}.jpg").is_file()
    assert database_path().with_name(f"{database_path().stem}.last-backup.txt").is_file()

    # A new laptop: other paths, nothing there. Rows still name the old photo folder.
    original = Path(os.environ["PRIVATE_MEDIA_DIR"])
    (original / f"{report}.jpg").unlink()
    new_home = tmp_path / "new laptop"
    new_home.mkdir()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(new_home / 'barangai.db').as_posix()}")
    monkeypatch.setenv("PRIVATE_MEDIA_DIR", str(new_home / "photos"))
    restored = backup.restore_backup(folder)
    assert restored["counts"]["reports"] == 1
    from barangai.main import create_app
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as fresh:
        assert fresh.post("/auth/login", json={"email": "ana@example.test", "password": PASSWORD}).status_code == 200
        detail = fresh.get(f"/reports/{report}").json()
        assert detail["status"] == "Accepted" and len(detail["events"]) == 3
        assert fresh.get(f"/reports/{report}/image").status_code == 200
    assert media.local_path(str(original / f"{report}.jpg")) == new_home / "photos" / f"{report}.jpg"


def test_restore_never_silently_overwrites_data(client, photo, tmp_path):
    from barangai import backup

    resident_report(client, photo, "ana@example.test")
    folder = backup.create_backup(tmp_path / "offsite")
    with pytest.raises(ValueError, match="already exists"):
        backup.restore_backup(folder)
    client.close()
    from barangai.db import engine_for_url

    engine_for_url(os.environ["DATABASE_URL"]).dispose()
    backup.restore_backup(folder, replace=True)
    assert list(database_path().parent.glob("*.replaced-*"))  # Set aside, not deleted.


def test_backup_finds_photos_saved_in_an_older_folder(client, photo, tmp_path):
    """Rows can name a folder other than today's (a real database here does), and backups must still include them."""
    from barangai import backup
    from barangai.db import session_for_url
    from barangai.models import Report

    report = resident_report(client, photo, "ana@example.test")
    older = tmp_path / "older"
    older.mkdir()
    moved = older / f"{report}.jpg"
    Path(os.environ["PRIVATE_MEDIA_DIR"], moved.name).rename(moved)
    with session_for_url() as db:
        db.get(Report, report).image_path = str(moved)
        db.commit()
    folder = backup.create_backup(tmp_path / "offsite")
    assert (folder / "photos" / moved.name).is_file()


def test_case_deleted_during_upload_leaves_a_standalone_report(client, photo, monkeypatch):
    from barangai import ai
    from barangai.db import session_for_url
    from barangai.delete_report import erase_rows
    from barangai.models import Report

    only = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, only, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    case_id = client.get(f"/reports/{only}").json()["case_id"]
    assert case_id
    real = ai.for_submission

    def delete_case_meanwhile(sanitized):
        with session_for_url() as db:
            erase_rows(db, db.get(Report, only))
            db.commit()
        return real(sanitized)

    monkeypatch.setattr(ai, "for_submission", delete_case_meanwhile)
    client.cookies.clear()
    register(client, email="ben@example.test")
    response = submit(client, photo, case_id=case_id)
    assert response.status_code == 201, response.text
    assert response.json()["case_id"] is None
    with session_for_url() as db:
        assert db.connection().exec_driver_sql("PRAGMA foreign_key_check").fetchall() == []


def test_confirming_i_see_this_too_cannot_close_a_report_unreviewed(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted", "In Progress")
    login(client, "ana@example.test")
    case_id = client.get(f"/reports/{first}").json()["case_id"]
    client.cookies.clear()
    register(client, email="ben@example.test")
    late = submit(client, photo, case_id=case_id).json()["id"]
    login(client, "staff@example.test", "staff-password-123")
    walk(client, first, "Resolved")
    decide = lambda decision: client.post(  # noqa: E731
        f"/reports/{late}/case/decision", json={"decision": decision}, headers=headers(client)
    )
    response = decide("confirmed")
    assert response.status_code == 409
    assert client.get(f"/reports/{late}").json()["status"] == "Pending"
    assert decide("rejected").status_code == 200  # Staff can still review it on its own.


def test_a_resident_learns_nothing_about_a_case_before_acceptance(client, photo):
    first = resident_report(client, photo, "ana@example.test", resident_category="potholes")
    second = resident_report(client, photo, "ben@example.test", resident_category="flooding")
    staff_login(client)
    response = client.post("/cases/link", json={"report_id": second, "other_report_id": first}, headers=headers(client))
    assert response.status_code == 200, response.text
    login(client, "ben@example.test")
    case = client.get(f"/reports/{second}/case").json()["case"]
    assert case["category"] is None and case["location_label"] is None and case["reports"] is None


def test_approved_deletion_is_not_stopped_by_a_slow_reader(client, photo):
    """A backup tool or database browser reading the file must not leave a report with its photo gone."""
    report = resident_report(client, photo, "ana@example.test")
    token = headers(client)
    assert (
        client.post(f"/reports/{report}/deletion-request", json={"reason": "Synthetic"}, headers=token).status_code
        < 300
    )
    staff_login(client)
    reader = sqlite3.connect(database_path())
    reader.execute("BEGIN")
    reader.execute("SELECT count(*) FROM reports").fetchone()
    try:
        response = client.post(
            f"/reports/{report}/deletion-request/decision", json={"decision": "approved"}, headers=headers(client)
        )
    finally:
        reader.close()
    assert response.status_code == 200, response.text
    assert client.get(f"/reports/{report}").status_code == 404
    assert media_files() == []


def test_deleted_account_leaves_no_trace_on_disk(client, photo):
    email = "unique-erased-person@example.test"
    report = resident_report(client, photo, email, description="Very unique synthetic words")
    assert client.post(f"/reports/{report}/deletion-request", json={}, headers=headers(client)).status_code < 300
    response = client.post("/auth/delete-account", json={"email": email, "password": PASSWORD}, headers=headers(client))
    assert response.status_code == 204, response.text
    # As on a running server: pooled connections stay open, and the log must still be clear.
    held = sqlite3.connect(database_path())
    held.execute("SELECT count(*) FROM users").fetchone()
    held.commit()
    raw = b"".join(path.read_bytes() for path in database_path().parent.glob(f"{database_path().name}*"))
    assert email.encode() not in raw and b"Very unique synthetic words" not in raw
    keys = [row[0] for row in held.execute("SELECT key FROM daily_usage")]
    held.close()
    assert not [key for key in keys if key.startswith(("deletion:", "preview:"))]


# Blurring is a promise to the people in a photo, so a broken install refuses photos instead of keeping them sharp.


@pytest.fixture
def broken_blur(monkeypatch, tmp_path):
    pytest.importorskip("cv2")
    from barangai import media, privacy

    monkeypatch.setenv("FACE_BLUR", "on")
    monkeypatch.setenv("FACE_MODEL_PATH", str(tmp_path / "absent.onnx"))
    privacy.detector.cache_clear()
    media.clear_sanitized_cache()
    yield
    privacy.detector.cache_clear()
    media.clear_sanitized_cache()


def test_missing_blur_model_stops_the_server_starting(client, broken_blur):
    from barangai import privacy
    from barangai.main import create_app

    with pytest.raises(privacy.BlurUnavailable, match="FACE_BLUR=off"):
        create_app()


def test_missing_blur_model_refuses_photos_and_stores_nothing(client, photo, broken_blur, monkeypatch):
    from barangai import ai

    sent = []
    monkeypatch.setattr(ai, "for_submission", lambda data: sent.append(data))
    client.cookies.clear()
    register(client)
    response = submit(client, photo)
    assert response.status_code == 503
    assert not sent and media_files() == []


def test_detection_crash_refuses_the_photo(client, photo, monkeypatch):
    from barangai import media, privacy

    def crash(image):
        raise RuntimeError("Synthetic failure")

    monkeypatch.setenv("FACE_BLUR", "on")
    monkeypatch.setattr(privacy, "detector", lambda: object())
    monkeypatch.setattr(privacy, "find_faces", crash)
    media.clear_sanitized_cache()
    register(client)
    assert submit(client, photo).status_code == 503
    assert media_files() == []


@pytest.mark.parametrize("error", [SyntaxError, TypeError, ValueError])
def test_malformed_images_are_refused_not_a_server_error(client, photo, monkeypatch, error):
    from barangai import media

    def malformed(*args, **kwargs):
        raise error("Synthetic malformed header")

    monkeypatch.setattr(media.Image, "open", malformed)
    with pytest.raises(media.HTTPException) as refused:
        media.sanitize_image(photo)
    assert refused.value.status_code == 422


def test_short_report_ids_are_masked_before_the_chat_model_sees_them():
    from barangai.chat import PRIVATE_DETAILS

    assert PRIVATE_DETAILS.search("what about report #A1B2C3D4?")
