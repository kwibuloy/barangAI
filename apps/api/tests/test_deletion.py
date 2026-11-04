import json
from pathlib import Path

import pytest
from conftest import register
from sqlalchemy import func, select
from test_reports import submit


@pytest.fixture
def deletion_data(client, photo):
    from barangai.auth import hasher
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion, Notification, Report, StaffAction, User

    register(client)
    target = submit(client, photo).json()["id"]
    other = submit(client, photo).json()["id"]
    with session_for_url() as db:
        admin = User(email="admin@example.test", password_hash=hasher.hash("synthetic-admin-password"),
                     role="administrator")
        db.add(admin)
        db.flush()
        report = db.get(Report, target)
        path = report.image_path
        db.add_all([
            Notification(user_id=report.resident_id, report_id=target, status="Under Verification"),
            StaffAction(report_id=target, actor_id=admin.id, kind="action", note="Synthetic action"),
            DuplicateSuggestion(report_id=target, candidate_report_id=other, model_version="synthetic", score=0.9),
            DuplicateSuggestion(report_id=other, candidate_report_id=target, model_version="synthetic", score=0.9),
        ])
        db.commit()
    return target, other, Path(path)


def run_deletion(data, **kwargs):
    from barangai.delete_report import delete_report

    return delete_report(data[0], "admin@example.test", "synthetic-admin-password", **kwargs)


def test_default_is_dry_run_with_no_data_or_file_changes(deletion_data, tmp_path):
    receipt = tmp_path / "receipts.jsonl"
    result = run_deletion(deletion_data, receipt_path=receipt)
    assert result["action"] == "dry-run"
    assert result["dependent_rows"] == {"notifications": 1, "duplicate_suggestions": 2,
                                        "staff_actions": 1, "report_events": 1, "report_addenda": 0,
                                        "report_photo_views": 0}
    assert deletion_data[2].is_file()
    assert not receipt.exists()


@pytest.mark.parametrize("email,password", [("admin@example.test", "wrong-password"),
                                           ("resident@example.test", "correct horse battery staple"),
                                           ("missing@example.test", "wrong-password")])
def test_admin_authentication_required(deletion_data, email, password, tmp_path):
    from barangai.delete_report import delete_report

    receipt = tmp_path / "receipts.jsonl"
    with pytest.raises(PermissionError, match="Administrator"):
        delete_report(deletion_data[0], email, password, confirm=deletion_data[0],
                      reason="resident-request", receipt_path=receipt)
    assert deletion_data[2].is_file()
    assert not receipt.exists()


def test_exact_confirmation_and_receipt_are_required(deletion_data, tmp_path):
    with pytest.raises(ValueError, match="exactly"):
        run_deletion(deletion_data, confirm=deletion_data[1], reason="resident-request",
                     receipt_path=tmp_path / "receipt.jsonl")
    with pytest.raises(ValueError, match="reason and a receipt"):
        run_deletion(deletion_data, confirm=deletion_data[0])
    assert deletion_data[2].is_file()


def test_staff_role_cannot_delete_even_with_correct_password(deletion_data, tmp_path):
    from barangai.db import session_for_url
    from barangai.models import User

    with session_for_url() as db:
        db.scalar(select(User).where(User.email == "admin@example.test")).role = "staff"
        db.commit()
    with pytest.raises(PermissionError, match="Administrator"):
        run_deletion(deletion_data, confirm=deletion_data[0], reason="resident-request",
                     receipt_path=tmp_path / "receipts.jsonl")
    assert deletion_data[2].is_file()


def test_delete_removes_both_duplicate_directions_and_preserves_users_and_other_report(deletion_data, tmp_path):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion, Notification, Report, ReportEvent, StaffAction, User

    receipt_file = tmp_path / "receipts.jsonl"
    receipt_file.write_text('{"earlier":"receipt"}\n')
    result = run_deletion(deletion_data, confirm=deletion_data[0], reason="synthetic-demo-cleanup",
                          receipt_path=receipt_file)
    assert not deletion_data[2].exists()
    with session_for_url() as db:
        assert db.get(Report, deletion_data[0]) is None
        assert db.get(Report, deletion_data[1]) is not None
        assert db.scalar(select(func.count()).select_from(User)) == 2
        for model in (DuplicateSuggestion, Notification, StaffAction):
            assert db.scalar(select(func.count()).select_from(model)) == 0
        assert db.scalar(select(func.count()).select_from(ReportEvent)) == 1
    records = [json.loads(line) for line in receipt_file.read_text().splitlines()]
    assert records[0] == {"earlier": "receipt"}
    assert records[1] == result
    assert set(result) == {"action", "report_id", "administrator_id", "time", "reason"}


def test_storage_failure_rolls_back_database_and_does_not_write_success_receipt(deletion_data, tmp_path, monkeypatch):
    from barangai import delete_report as module

    def unavailable(location):
        raise OSError("synthetic storage failure")

    monkeypatch.setattr(module, "delete_image", unavailable)
    receipt = tmp_path / "receipts.jsonl"
    with pytest.raises(OSError, match="storage failure"):
        run_deletion(deletion_data, confirm=deletion_data[0], reason="resident-request", receipt_path=receipt)
    assert receipt.read_text() == ""
    assert deletion_data[2].is_file()
    assert run_deletion(deletion_data)["dependent_rows"]["duplicate_suggestions"] == 2


def test_retry_after_database_commit_failure_accepts_missing_image(deletion_data, tmp_path, monkeypatch):
    from sqlalchemy.orm import Session

    receipt = tmp_path / "receipts.jsonl"
    with monkeypatch.context() as patch:
        def fail_commit(self):
            raise RuntimeError("synthetic database commit failure")

        patch.setattr(Session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="commit failure"):
            run_deletion(deletion_data, confirm=deletion_data[0], reason="resident-request", receipt_path=receipt)
    assert not deletion_data[2].exists()
    assert receipt.read_text() == ""
    assert run_deletion(deletion_data)["dependent_rows"]["notifications"] == 1
    assert run_deletion(deletion_data, confirm=deletion_data[0], reason="resident-request",
                        receipt_path=receipt)["action"] == "report-deleted"


def test_receipt_path_failure_preserves_report_and_photo(deletion_data, tmp_path):
    with pytest.raises(OSError):
        run_deletion(deletion_data, confirm=deletion_data[0], reason="resident-request", receipt_path=tmp_path)
    assert deletion_data[2].exists()
    assert run_deletion(deletion_data)["action"] == "dry-run"


def test_receipt_sync_failure_exposes_recovery_receipt_after_success(deletion_data, tmp_path, monkeypatch):
    from barangai import delete_report as module

    def fail_sync(descriptor):
        raise OSError("synthetic disk sync failure")

    monkeypatch.setattr(module.os, "fsync", fail_sync)
    with pytest.raises(module.ReceiptWriteError) as error:
        run_deletion(deletion_data, confirm=deletion_data[0], reason="retention-expired",
                     receipt_path=tmp_path / "receipts.jsonl")
    assert error.value.receipt["report_id"] == deletion_data[0]
    with pytest.raises(ValueError, match="not found"):
        run_deletion(deletion_data)


def test_cli_uses_password_prompt_and_defaults_to_inspection(deletion_data, monkeypatch, capsys):
    from barangai import delete_report as module

    prompts = []

    def password_prompt(prompt):
        prompts.append(prompt)
        return "synthetic-admin-password"

    monkeypatch.setattr(module, "getpass", password_prompt)
    assert module.main([deletion_data[0], "--email", "admin@example.test"]) == 0
    assert prompts == ["Administrator password: "]
    assert json.loads(capsys.readouterr().out)["action"] == "dry-run"
    assert deletion_data[2].is_file()


def test_delete_removes_details_the_resident_added_and_their_photos(client, deletion_data, photo, tmp_path):
    from barangai.db import session_for_url
    from barangai.models import ReportAddendum

    added = client.post(f"/reports/{deletion_data[0]}/addenda", data={"note": "Synthetic: water is rising"},
                        files={"image": ("more.jpg", photo, "image/jpeg")},
                        headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})
    assert added.status_code == 201, added.text
    with session_for_url() as db:
        extra = Path(db.get(ReportAddendum, added.json()["id"]).image_path)
    assert extra.is_file()
    assert run_deletion(deletion_data)["images"] == 2
    run_deletion(deletion_data, confirm=deletion_data[0], receipt_path=tmp_path / "r.jsonl",
                 reason="synthetic-demo-cleanup")
    with session_for_url() as db:
        assert db.scalar(select(func.count()).select_from(ReportAddendum)) == 0
    assert not extra.exists()


def test_a_disabled_administrator_cannot_delete_from_the_command_line(deletion_data):
    from barangai.db import session_for_url
    from barangai.models import User, now

    with session_for_url() as db:
        db.query(User).filter_by(role="administrator").first().disabled_at = now()
        db.commit()
    with pytest.raises(PermissionError):
        run_deletion(deletion_data)
