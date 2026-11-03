"""Audit fixes: accounts, deletion, what residents see, database-counted limits and the hosted site's headers.
Synthetic people and places only."""

import io
import os
import subprocess
import sys
from pathlib import Path

import pytest
from conftest import register
from fastapi.testclient import TestClient
from PIL import Image
from test_cases import headers, login, resident_report, walk
from test_reports import submit
from test_workflow import staff_login

PASSWORD = "correct horse battery staple"


def jpeg(color="red"):
    output = io.BytesIO()
    Image.new("RGB", (8, 8), color).save(output, format="JPEG")
    return output.getvalue()


def staff(client):
    """staff_login creates the account, so only once per test."""
    from barangai.models import User

    if rows(User, User.email == "staff@example.test"):
        login(client, "staff@example.test", "staff-password-123")
    else:
        staff_login(client)


def accepted(client, photo, email="ana@example.test"):
    report = resident_report(client, photo, email)
    staff(client)
    walk(client, report, "Under Verification", "Accepted", category="potholes")
    return report


def admin_login(client):
    from barangai.bootstrap_staff import create_staff

    create_staff("admin@example.test", PASSWORD, "administrator")
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "admin@example.test", "password": PASSWORD}).status_code == 200


def rows(model, *where):
    from barangai.db import session_for_url
    from sqlalchemy import select

    with session_for_url() as db:
        return db.scalars(select(model).where(*where)).all()


# Terms


def test_registration_needs_the_terms_and_records_them(client):
    refused = client.post("/auth/register", json={"email": "a@example.test", "password": PASSWORD})
    assert refused.status_code == 422
    assert register(client, "a@example.test").status_code == 201
    from barangai.auth import TERMS_VERSION
    from barangai.models import User

    user = rows(User, User.email == "a@example.test")[0]
    assert user.terms_accepted_at and user.terms_version == TERMS_VERSION


def test_operator_details_come_from_settings_and_are_never_guessed(client, monkeypatch):
    monkeypatch.delenv("OPERATOR_NAME", raising=False)
    monkeypatch.delenv("PRIVACY_CONTACT", raising=False)
    assert client.get("/legal/operator").json() == {"name": None, "contact": None}
    monkeypatch.setenv("OPERATOR_NAME", "Synthetic Barangay")
    monkeypatch.setenv("PRIVACY_CONTACT", "privacy@example.test")
    assert client.get("/legal/operator").json() == {"name": "Synthetic Barangay", "contact": "privacy@example.test"}


# Password


def test_changing_password_needs_the_old_one_and_signs_out_other_devices(client):
    from barangai.main import create_app

    register(client)
    other = TestClient(create_app())
    assert other.post("/auth/login", json={"email": "resident@example.test", "password": PASSWORD}).status_code == 200
    new = {"current_password": "wrong password here", "new_password": "a brand new synthetic password"}
    assert client.post("/auth/password", headers=headers(client), json=new).status_code == 403
    new["current_password"] = PASSWORD
    assert client.post("/auth/password", headers=headers(client), json=new).status_code == 204
    assert client.get("/auth/me").status_code == 200
    assert other.get("/auth/me").status_code == 401
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "resident@example.test", "password": PASSWORD}).status_code == 401


def test_cli_password_reset_signs_the_account_out(client):
    from barangai.bootstrap_staff import reset_password

    register(client)
    reset_password("resident@example.test", "a brand new synthetic password")
    assert client.get("/auth/me").status_code == 401


# Deleting an account


def test_deleting_an_account_removes_its_reports_and_photos(client, photo):
    from barangai.models import Case, LoginSession, Notification, Report, User

    report = accepted(client, photo)
    image = rows(Report, Report.id == report)[0].image_path
    resident_id = rows(User, User.email == "ana@example.test")[0].id
    login(client, "ana@example.test")
    wrong = {"email": "other@example.test", "password": PASSWORD}
    assert client.post("/auth/delete-account", headers=headers(client), json=wrong).status_code == 422
    wrong = {"email": "ana@example.test", "password": "wrong password here"}
    assert client.post("/auth/delete-account", headers=headers(client), json=wrong).status_code == 403
    done = client.post(
        "/auth/delete-account", headers=headers(client), json={"email": "ana@example.test", "password": PASSWORD}
    )
    assert done.status_code == 204
    assert not rows(User, User.email == "ana@example.test")
    assert not rows(Report) and not rows(Case) and not rows(Notification, Notification.report_id == report)
    assert not rows(LoginSession, LoginSession.user_id == resident_id)
    assert not Path(image).exists()
    assert client.get("/auth/me").status_code == 401


def test_staff_cannot_delete_their_account_from_the_app(client):
    admin_login(client)
    response = client.post(
        "/auth/delete-account", headers=headers(client), json={"email": "admin@example.test", "password": PASSWORD}
    )
    assert response.status_code == 403


# Deletion leaves no location behind


def test_cli_deletion_removes_a_case_left_with_no_reports(client, photo, tmp_path):
    from barangai.delete_report import delete_report
    from barangai.models import Case

    report = accepted(client, photo)
    assert len(rows(Case)) == 1
    from barangai.bootstrap_staff import create_staff

    create_staff("admin@example.test", PASSWORD, "administrator")
    delete_report(
        report,
        "admin@example.test",
        PASSWORD,
        confirm=report,
        reason="resident-request",
        receipt_path=str(tmp_path / "receipt"),
    )
    assert not rows(Case)


def test_case_moves_off_a_deleted_reports_pin(client, tmp_path):
    from barangai.bootstrap_staff import create_staff
    from barangai.delete_report import delete_report
    from barangai.models import Case

    def report_at(email, latitude):
        register(client, email)
        response = client.post(
            "/reports",
            headers=headers(client),
            files={"image": ("p.jpg", jpeg(), "image/jpeg")},
            data={"latitude": latitude, "longitude": 120.95, "resident_category": "flooding"},
        )
        client.cookies.clear()
        return response.json()["id"]

    first, second = report_at("ana@example.test", 14.34), report_at("ben@example.test", 14.3401)
    staff(client)
    walk(client, first, "Under Verification", "Accepted")
    assert (
        client.post(
            "/cases/link", headers=headers(client), json={"report_id": first, "other_report_id": second}
        ).status_code
        == 200
    )
    create_staff("admin@example.test", PASSWORD, "administrator")
    delete_report(
        first, "admin@example.test", PASSWORD, confirm=first, reason="resident-request", receipt_path=str(tmp_path / "receipt")
    )
    assert rows(Case)[0].latitude == 14.3401


def test_unchecked_pin_never_reaches_the_map_when_a_report_is_deleted(client, photo, tmp_path):
    from barangai.bootstrap_staff import create_staff
    from barangai.delete_report import delete_report

    first = accepted(client, photo, "ana@example.test")
    case = client.get(f"/reports/{first}/case").json()["case"]["id"]
    resident_report(client, jpeg("blue"), "ben@example.test", case_id=case, latitude="14.37")
    second = resident_report(client, jpeg("green"), "cara@example.test", latitude="14.6001")
    staff(client)
    assert client.post("/cases/link", headers=headers(client),
                       json={"report_id": first, "other_report_id": second}).status_code == 200
    create_staff("admin@example.test", PASSWORD, "administrator")
    delete_report(first, "admin@example.test", PASSWORD, confirm=first, reason="resident-request",
                  receipt_path=str(tmp_path / "receipt"))
    assert [item["latitude"] for item in client.get("/cases/map").json()] == [14.6001]


def test_deleting_the_last_confirmed_report_frees_unchecked_ones(client, photo, tmp_path):
    from barangai.bootstrap_staff import create_staff
    from barangai.delete_report import delete_report
    from barangai.models import Case, Report

    first = accepted(client, photo, "ana@example.test")
    case = client.get(f"/reports/{first}/case").json()["case"]["id"]
    other = resident_report(client, jpeg("blue"), "ben@example.test", case_id=case)
    create_staff("admin@example.test", PASSWORD, "administrator")
    delete_report(first, "admin@example.test", PASSWORD, confirm=first, reason="resident-request",
                  receipt_path=str(tmp_path / "receipt"))
    assert not rows(Case)
    assert rows(Report, Report.id == other)[0].case_id is None


# Deletion requests


def test_resident_requests_deletion_and_an_administrator_decides(client, photo):
    from barangai.models import DeletionRequest, Notification, Report

    report = resident_report(client, photo, "ana@example.test")
    from barangai.bootstrap_staff import create_staff

    create_staff("admin@example.test", PASSWORD, "administrator")
    login(client, "ana@example.test")
    sent = client.post(
        f"/reports/{report}/deletion-request", headers=headers(client), json={"reason": "Synthetic reason"}
    )
    assert sent.status_code == 201 and sent.json()["status"] == "pending"
    assert client.post(f"/reports/{report}/deletion-request", headers=headers(client), json={}).status_code == 409
    assert client.get(f"/reports/{report}").json()["deletion_request"]["status"] == "pending"
    assert (
        client.post(
            f"/reports/{report}/deletion-request/decision", headers=headers(client), json={"decision": "approved"}
        ).status_code
        == 403
    )

    client.cookies.clear()
    client.post("/auth/login", json={"email": "admin@example.test", "password": PASSWORD})
    assert [item.kind for item in rows(Notification, Notification.kind == "deletion_request")] == ["deletion_request"]
    declined = client.post(
        f"/reports/{report}/deletion-request/decision",
        headers=headers(client),
        json={"decision": "declined", "note": "Synthetic note"},
    )
    assert declined.json()["status"] == "declined"
    assert rows(Notification, Notification.kind == "deletion_declined")

    client.cookies.clear()
    login(client, "ana@example.test")
    client.post(f"/reports/{report}/deletion-request", headers=headers(client), json={"reason": "Asking again"})
    client.cookies.clear()
    client.post("/auth/login", json={"email": "admin@example.test", "password": PASSWORD})
    approved = client.post(
        f"/reports/{report}/deletion-request/decision", headers=headers(client), json={"decision": "approved"}
    )
    assert approved.json()["status"] == "approved"
    assert not rows(Report)
    kept = rows(DeletionRequest, DeletionRequest.status == "approved")[0]
    assert kept.report_id == report and kept.reason is None


# What residents see


def test_residents_do_not_see_coordination_notes_staff_ids_or_grouping_logs(client, photo):
    report = accepted(client, photo)
    for kind, note in (("coordination", "Synthetic call to city hall"), ("action", "Synthetic crew sent")):
        client.post(f"/reports/{report}/actions", headers=headers(client), json={"kind": kind, "note": note})
    staff_view = client.get(f"/reports/{report}").json()
    assert {action["kind"] for action in staff_view["actions"]} == {"coordination", "action"}
    assert staff_view["actions"][0]["actor_id"] and staff_view["events"][0]["actor_id"]
    login(client, "ana@example.test")
    seen = client.get(f"/reports/{report}").json()
    assert [action["note"] for action in seen["actions"]] == ["Synthetic crew sent"]
    assert "actor_id" not in seen["actions"][0] and "actor_id" not in seen["events"][0]


def test_grouping_logs_are_not_ordinary_actions(client, photo):
    from barangai.models import StaffAction

    first = accepted(client, photo)
    second = resident_report(client, jpeg("blue"), "ben@example.test")
    staff(client)
    client.post("/cases/link", headers=headers(client), json={"report_id": first, "other_report_id": second})
    assert {item.kind for item in rows(StaffAction)} == {"system"}


# Hazards


def fake_analysis(monkeypatch, hazards):
    from barangai import ai

    monkeypatch.setattr(
        ai,
        "for_submission",
        lambda image: ai.Analysis(
            category="potholes",
            confidence=None,
            source="vision",
            needs_check=False,
            problem_seen=True,
            description=None,
            hazards=hazards,
            embedding=None,
            embedding_version=None,
        ),
    )


def test_resident_can_remove_an_ai_hazard_flag_but_never_add_one(client, photo, monkeypatch):
    fake_analysis(monkeypatch, ("blocks_road", "risk_to_people"))
    register(client)
    response = client.post(
        "/reports",
        headers=headers(client),
        files={"image": ("p.jpg", photo, "image/jpeg")},
        data={
            "latitude": 14.33,
            "longitude": 120.94,
            "resident_category": "potholes",
            "dismissed_hazards": ["risk_to_people", "electrical_hazard"],
        },
    )
    assert response.status_code == 201 and response.json()["hazards"] == ["blocks_road"]


def test_shared_map_has_no_ai_hazard_flags(client, photo, monkeypatch):
    fake_analysis(monkeypatch, ("blocks_road",))
    accepted(client, photo)
    items = client.get("/cases/map").json()
    assert items and "hazards" not in items[0]


# Limits in the database


def test_invalid_uploads_use_up_no_site_allowance(client, photo, monkeypatch):
    monkeypatch.setenv("MAX_SITE_REPORTS_PER_DAY", "1")
    register(client, "a@example.test")
    bad = {"image": ("p.jpg", b"not an image", "image/jpeg")}
    fields = {"latitude": 14.33, "longitude": 120.94, "resident_category": "potholes"}
    assert client.post("/reports", headers=headers(client), files=bad, data=fields).status_code == 422
    assert submit(client, photo).status_code == 201


def test_invalid_previews_use_up_no_allowance(client, photo, monkeypatch):
    monkeypatch.setenv("MAX_PREVIEWS_PER_DAY", "1")
    register(client)
    bad = {"image": ("p.jpg", b"not an image", "image/jpeg")}
    assert client.post("/reports/predict", headers=headers(client), files=bad).status_code == 422
    assert client.post("/reports/predict", headers=headers(client),
                       files={"image": ("p.jpg", photo, "image/jpeg")}).status_code == 200


def test_residents_do_not_see_automatic_case_step_notes(client, photo):
    from barangai.cases import GROUPED_NOTE

    first = accepted(client, photo)
    second = resident_report(client, jpeg("blue"), "ben@example.test")
    staff(client)
    client.post("/cases/link", headers=headers(client), json={"report_id": first, "other_report_id": second})
    assert any((event["note"] or "").startswith("Updated with case") for event in client.get(f"/reports/{second}").json()["events"])
    login(client, "ben@example.test")
    notes = [event["note"] for event in client.get(f"/reports/{second}").json()["events"]]
    assert not any((note or "").startswith("Updated with case") for note in notes)
    assert notes[-1] == GROUPED_NOTE
    assert not any(notes[:-1])


def test_previews_are_capped_per_resident_per_day(client, photo, monkeypatch):
    monkeypatch.setenv("MAX_PREVIEWS_PER_DAY", "1")
    register(client)
    files = {"image": ("p.jpg", photo, "image/jpeg")}
    assert client.post("/reports/predict", headers=headers(client), files=files).status_code == 200
    blocked = client.post("/reports/predict", headers=headers(client), files=files)
    assert blocked.status_code == 429 and "Daily limit" in blocked.json()["detail"]


def test_vision_model_stops_at_the_site_allowance_but_previews_continue(client, photo, monkeypatch):
    from barangai import vision

    calls = []
    monkeypatch.setattr(vision, "describe", lambda *args: calls.append(args) or None)
    monkeypatch.setenv("MAX_SITE_VISION_PER_DAY", "1")
    register(client)
    for color in ("red", "blue"):
        files = {"image": ("p.jpg", jpeg(color), "image/jpeg")}
        assert client.post("/reports/predict", headers=headers(client), files=files).status_code == 200
    assert len(calls) == 1


def test_signups_are_capped_across_the_site(client, monkeypatch):
    monkeypatch.setenv("MAX_SIGNUPS_PER_HOUR", "1")
    assert register(client, "a@example.test").status_code == 201
    client.cookies.clear()
    assert register(client, "b@example.test").status_code == 429


def test_reports_are_capped_across_the_site(client, photo, monkeypatch):
    monkeypatch.setenv("MAX_SITE_REPORTS_PER_DAY", "1")
    register(client, "a@example.test")
    assert submit(client, photo).status_code == 201
    client.cookies.clear()
    register(client, "b@example.test")
    assert submit(client, photo).status_code == 429


def test_counts_survive_a_restart(client, monkeypatch):
    from barangai.auth import attempts

    monkeypatch.setenv("MAX_SIGNUPS_PER_HOUR", "1")
    register(client, "a@example.test")
    attempts.clear()
    client.cookies.clear()
    assert register(client, "b@example.test").status_code == 429


# Proxies, memory and odd input


def test_unknown_proxy_chain_does_not_share_one_limit_across_everyone(client, monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    forwarded = {"X-Forwarded-For": "203.0.113.9, 198.51.100.7"}
    for number in range(70):
        response = client.post(
            "/auth/login",
            headers=forwarded,
            json={"email": f"nobody{number}@example.test", "password": "wrong password here"},
        )
        assert response.status_code == 401


def test_strangers_cannot_lock_out_the_owner_behind_an_unknown_proxy(client, monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    register(client)
    client.cookies.clear()
    forwarded = {"X-Forwarded-For": "203.0.113.9, 198.51.100.7"}
    for _ in range(12):
        client.post("/auth/login", headers=forwarded,
                    json={"email": "resident@example.test", "password": "wrong password here"})
    response = client.post("/auth/login", headers=forwarded, json={"email": "resident@example.test", "password": PASSWORD})
    assert response.status_code == 200


def test_unknown_proxy_chain_still_has_a_shared_flood_limit(client, monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "synthetic")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "synthetic")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "https://example.test/api/auth/google/callback")
    forwarded = {"X-Forwarded-For": "203.0.113.9"}
    codes = [client.get("/auth/google/start", headers=forwarded, follow_redirects=False).status_code for _ in range(101)]
    assert codes[99] == 302 and codes[100] == 429


def test_known_proxy_chain_limits_by_address(client, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "2")
    forwarded = {"X-Forwarded-For": "203.0.113.9, 198.51.100.7"}
    codes = [
        client.post(
            "/auth/login",
            headers=forwarded,
            json={"email": f"nobody{number}@example.test", "password": "wrong password here"},
        ).status_code
        for number in range(61)
    ]
    assert codes[-1] == 429


def test_json_routes_refuse_a_large_body(client):
    response = client.post("/auth/login", json={"email": "a@example.test", "password": "x" * 100_000})
    assert response.status_code == 413


def test_long_password_is_refused_without_hashing(client):
    register(client)
    client.cookies.clear()
    response = client.post("/auth/login", json={"email": "resident@example.test", "password": "x" * 129})
    assert response.status_code == 401


def test_non_ascii_csrf_and_oauth_state_are_refused_not_crashes(client, monkeypatch):
    register(client)
    assert client.post("/auth/logout", headers={"X-CSRF-Token": "é".encode()}).status_code == 403
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "synthetic")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "synthetic")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "https://example.test/api/auth/google/callback")
    client.cookies.set("google_oauth_state", "abc")
    response = client.get("/auth/google/callback?state=%C3%A9", follow_redirects=False)
    assert response.status_code == 303 and "google_invalid_state" in response.headers["location"]


def test_api_starts_without_numpy(tmp_path):
    code = ("import sys; sys.modules['numpy'] = None; from barangai import checker, main; "
            "assert checker.check(b'') is None")
    environment = {**os.environ, "DATABASE_URL": f"sqlite:///{(tmp_path / 'n.db').as_posix()}"}
    environment.pop("CHECKER_MODEL_DIR", None)
    subprocess.run([sys.executable, "-c", code], check=True, env=environment, cwd=Path(__file__).resolve().parents[1])


# The hosted site


@pytest.fixture
def hosted(client, tmp_path, monkeypatch):
    from barangai.main import create_app, site_app

    (tmp_path / "index.html").write_text("<script>var theme = 1</script><title>Synthetic</title>")
    monkeypatch.setenv("STATIC_SITE_DIR", str(tmp_path))
    monkeypatch.setenv("COOKIE_SECURE", "true")
    with TestClient(site_app(create_app(), tmp_path)) as browser:
        yield browser


def test_hosted_site_hides_api_docs(hosted):
    assert hosted.get("/api/docs").status_code == 404
    assert hosted.get("/api/openapi.json").status_code == 404


def test_hosted_site_sends_security_headers_that_allow_its_own_theme_script(hosted):
    response = hosted.get("/")
    policy = response.headers["content-security-policy"]
    assert "script-src 'self' 'sha256-" in policy and "unsafe-inline' ; " not in policy
    assert "https://*.tile.openstreetmap.org" in policy and "frame-ancestors 'none'" in policy
    assert response.headers["strict-transport-security"]


def test_direct_connections_keep_the_strict_limit_despite_a_forwarded_header(client, monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    monkeypatch.setenv("DIRECT_CONNECTIONS", "true")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "synthetic")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "synthetic")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "https://example.test/api/auth/google/callback")
    forwarded = {"X-Forwarded-For": "203.0.113.9"}
    codes = [client.get("/auth/google/start", headers=forwarded, follow_redirects=False).status_code for _ in range(11)]
    assert codes[9] == 302 and codes[10] == 429
