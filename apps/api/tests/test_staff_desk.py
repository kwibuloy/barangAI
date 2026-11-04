"""Temporary passwords, the phone address, feedback and the duplicate comparison the staff desk reads."""

import socket

from conftest import register
from test_admin import admin, create, rows, user_id
from test_barangays import account, load_areas
from test_cases import PASSWORD, headers, login, resident_report
from test_links_and_polls import FAR, suggestion
from test_workflow import staff_login

NEW_PASSWORD = "staff-chose-this-phrase"


def sign_in(client, email, password):
    client.cookies.clear()
    answer = client.post("/auth/login", json={"email": email, "password": password})
    assert answer.status_code == 200, answer.text
    return answer.json()


def change(client, current, new=NEW_PASSWORD):
    return client.post(
        "/auth/password", json={"current_password": current, "new_password": new}, headers=headers(client)
    )


def test_a_new_account_can_do_nothing_but_change_its_temporary_password_or_sign_out(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    admin(client)
    created = create(client, email="desk@example.test", role="staff").json()
    assert created["must_change_password"] is True
    temporary = created["temporary_password"]

    me = sign_in(client, "desk@example.test", temporary)
    assert me["must_change_password"] is True
    assert client.get("/auth/me").json()["must_change_password"] is True

    # Reads still answer, so the screen can load; every write is refused, including a status change.
    assert client.get("/reports").status_code == 200
    status = client.post(
        f"/reports/{report}/status", json={"status": "Under Verification", "note": "x"}, headers=headers(client)
    )
    assert status.status_code == 403 and status.json()["detail"] == "Change your temporary password first"
    assert client.put("/auth/preferences", json={"theme": "dark"}, headers=headers(client)).status_code == 403
    assert client.post("/feedback", json={"message": "Hello"}, headers=headers(client)).status_code == 403

    assert change(client, "wrong-password-123").status_code == 403
    same = change(client, temporary, temporary)
    assert same.status_code == 422 and client.get("/auth/me").json()["must_change_password"] is True

    assert change(client, temporary).status_code == 204
    assert client.get("/auth/me").json()["must_change_password"] is False
    answer = client.post(
        f"/reports/{report}/status", json={"status": "Under Verification", "note": "Checking"}, headers=headers(client)
    )
    assert answer.status_code == 200
    assert sign_in(client, "desk@example.test", NEW_PASSWORD)["must_change_password"] is False


def test_signing_out_works_with_a_temporary_password(client):
    admin(client)
    temporary = create(client, email="desk@example.test", role="staff").json()["temporary_password"]
    sign_in(client, "desk@example.test", temporary)
    assert client.post("/auth/logout", headers=headers(client)).status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_a_reset_needs_a_new_change_and_csrf_still_guards_the_way_out(client):
    account("desk@example.test", "staff")
    admin(client)
    target = user_id("desk@example.test")
    listed = {item["email"]: item for item in client.get("/admin/staff").json()}
    assert listed["desk@example.test"]["must_change_password"] is False
    temporary = client.post(f"/admin/staff/{target}/reset-password", headers=headers(client)).json()[
        "temporary_password"
    ]
    assert {item["email"]: item for item in client.get("/admin/staff").json()}["desk@example.test"][
        "must_change_password"
    ]

    sign_in(client, "desk@example.test", temporary)
    refused = client.post("/auth/password", json={"current_password": temporary, "new_password": NEW_PASSWORD})
    assert refused.status_code == 403
    assert client.post("/auth/logout").status_code == 403
    assert change(client, temporary).status_code == 204


def test_residents_and_a_changed_password_never_carry_the_flag(client):
    register(client)
    assert client.get("/auth/me").json()["must_change_password"] is False
    assert change(client, PASSWORD).status_code == 204


def test_only_administrators_read_the_server_address(client, monkeypatch):
    from barangai import admin as admin_module

    monkeypatch.setattr(admin_module, "lan_addresses", lambda: ["192.168.1.20", "10.0.0.5"])
    monkeypatch.setattr(admin_module, "accepts_connections", lambda address, port: address == "192.168.1.20")
    register(client)
    assert client.get("/admin/server-address").status_code == 403
    account("desk@example.test", "staff")
    login(client, "desk@example.test", "account-password-123")
    assert client.get("/admin/server-address").status_code == 403
    client.cookies.clear()
    assert client.get("/admin/server-address").status_code == 401

    admin(client)
    answer = client.get("/admin/server-address", headers={"Host": "evil.example.test"})
    assert answer.status_code == 200
    addresses = answer.json()["addresses"]
    assert [item["listening"] for item in addresses] == [True, False]
    assert addresses[0]["url"].startswith("http://192.168.1.20:") and "evil" not in answer.text


def test_lan_addresses_keep_private_ones_with_the_route_first(monkeypatch):
    from barangai import admin as admin_module

    class Probe:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def connect(self, _):
            return None

        def getsockname(self):
            return ("192.168.1.20", 5000)

    monkeypatch.setattr(admin_module.socket, "socket", lambda *_: Probe())
    monkeypatch.setattr(
        admin_module.socket,
        "getaddrinfo",
        lambda *_: [
            (None, None, None, None, (address, 0))
            for address in ("127.0.0.1", "169.254.3.4", "8.8.8.8", "172.20.0.2", "192.168.1.20")
        ],
    )
    assert admin_module.lan_addresses() == ["192.168.1.20", "172.20.0.2"]


def test_lan_addresses_survive_a_computer_with_no_network(monkeypatch):
    from barangai import admin as admin_module

    def offline(*_):
        raise OSError("no network")

    monkeypatch.setattr(admin_module.socket, "socket", offline)
    monkeypatch.setattr(admin_module.socket, "getaddrinfo", offline)
    assert admin_module.lan_addresses() == []


def test_a_port_nobody_listens_on_reads_as_not_listening():
    with socket.socket() as holder:
        holder.bind(("127.0.0.1", 0))
        free = holder.getsockname()[1]
    from barangai.admin import accepts_connections

    assert accepts_connections("127.0.0.1", free) is False


def send(client, message="The list could be easier to read."):
    return client.post("/feedback", json={"message": message}, headers=headers(client))


def age_feedback(minutes):
    from datetime import timedelta

    from barangai.db import session_for_url
    from barangai.models import Feedback, now

    with session_for_url() as db:
        for item in db.query(Feedback):
            item.created_at = now() - timedelta(minutes=minutes)
        db.commit()


def test_feedback_is_one_note_per_person_per_five_minutes_and_only_administrators_read_it(client):
    from barangai.models import Feedback

    register(client)
    me = client.get("/auth/me").json()["id"]
    assert client.post("/feedback", json={"message": "No token"}).status_code == 403
    assert send(client, "   ").status_code == 422
    assert send(client, "x" * 1001).status_code == 422
    assert send(client, "x" * 1000).status_code == 201
    assert send(client).status_code == 429
    assert len(rows(Feedback)) == 1
    age_feedback(6)
    assert send(client).status_code == 201

    assert client.get("/admin/feedback").status_code == 403
    account("desk@example.test", "staff")
    login(client, "desk@example.test", "account-password-123")
    assert client.get("/admin/feedback").status_code == 403
    assert send(client).status_code == 201  # Staff send it too.
    client.cookies.clear()
    assert client.get("/admin/feedback").status_code == 401
    assert client.post("/feedback", json={"message": "Signed out"}).status_code == 401

    admin(client)
    listed = client.get("/admin/feedback").json()
    assert {tuple(sorted(item)) for item in listed} == {("created_at", "id", "message", "user_id")}
    assert me in {item["user_id"] for item in listed} and "x" * 1000 in {item["message"] for item in listed}
    assert len(client.get("/admin/feedback?limit=1").json()) == 1


def test_feedback_goes_with_the_account_and_comes_with_its_data_export(client):
    from barangai.models import Erasure, Feedback

    register(client)
    assert send(client, "A note of mine").status_code == 201
    assert [item["message"] for item in client.get("/auth/export").json()["feedback"]] == ["A note of mine"]
    me = client.get("/auth/me").json()
    answer = client.post(
        "/auth/delete-account", json={"email": me["email"], "password": PASSWORD}, headers=headers(client)
    )
    assert answer.status_code == 204
    assert rows(Feedback) == [] and [item.subject_id for item in rows(Erasure)] == [me["id"]]


def test_duplicate_review_shows_both_reports_and_stays_inside_the_barangay(client, photo):
    load_areas()
    account("north@example.test", "staff", "North")
    account("south@example.test", "staff", "South")
    north = dict(latitude="14.6150", longitude="121.0050")
    first = resident_report(client, photo, "ana@example.test", description="SECRET words", **north)
    second = resident_report(client, photo, "ben@example.test", latitude="14.6151", longitude="121.0050")
    south = resident_report(client, photo, "cy@example.test", latitude="14.6050", longitude="121.0050")
    suggestion(first, second)
    suggestion(first, south)

    from barangai.db import session_for_url
    from barangai.models import Report

    with session_for_url() as db:
        db.get(Report, first).embedding_model_version = "synthetic"
        db.get(Report, first).image_embedding = [1.0, 0.0]
        db.commit()

    import os

    os.environ["VALIDATED_EMBEDDING_MODEL_VERSION"] = "synthetic"
    try:
        login(client, "north@example.test", "account-password-123")
        data = client.get(f"/reports/{first}/duplicates").json()
    finally:
        del os.environ["VALIDATED_EMBEDDING_MODEL_VERSION"]
    assert [item["candidate_report_id"] for item in data["suggestions"]] == [second]
    item = data["suggestions"][0]
    assert 10 <= item["distance_m"] <= 12
    assert item["candidate"] == {
        "id": second,
        "status": "Pending",
        "resident_category": "flooding",
        "verified_category": None,
        "created_at": item["candidate"]["created_at"],
        "location_label": None,
        "image_url": f"/api/reports/{second}/image",
    }
    assert data["report"]["id"] == first and "SECRET" not in str(data)

    # The photo itself goes through the same authorized route, which holds staff to their barangay.
    assert client.get(item["candidate"]["image_url"].removeprefix("/api")).status_code == 200
    assert client.get(f"/reports/{south}/image").status_code == 404
    login(client, "south@example.test", "account-password-123")
    assert client.get(f"/reports/{first}/duplicates").status_code == 404
    login(client, "ana@example.test")
    assert client.get(f"/reports/{first}/duplicates").status_code == 403


def test_duplicate_review_without_a_validated_model_says_so(client, photo):
    report = resident_report(client, photo, "ana@example.test", **FAR)
    staff_login(client)
    data = client.get(f"/reports/{report}/duplicates").json()
    assert data == {"embedding_available": False, "suggestions": [], "manual_review_required": True}
