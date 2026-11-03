from conftest import register
from test_reports import submit


def staff_login(client):
    from barangai.auth import hasher
    from barangai.db import session_for_url
    from barangai.models import User

    with session_for_url() as db:
        db.add(User(email="staff@example.test", password_hash=hasher.hash("staff-password-123"), role="staff"))
        db.commit()
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "staff@example.test", "password": "staff-password-123"}).status_code == 200


def change(client, report_id, status, **extra):
    return client.post(f"/reports/{report_id}/status", json={"status": status, **extra},
                       headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})


def test_staff_can_follow_graph_with_audited_events(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    staff_login(client)
    assert change(client, report_id, "Under Verification", note="Reviewing synthetic report").status_code == 200
    assert change(client, report_id, "Accepted", verified_category="flooding").status_code == 200
    assert change(client, report_id, "In Progress").status_code == 200
    response = change(client, report_id, "Resolved", note="Synthetic cleanup finished")
    assert response.status_code == 200
    detail = response.json()
    assert detail["status"] == "Resolved"
    assert detail["verified_category"] == "flooding"
    assert [event["to_status"] for event in detail["events"]] == ["Pending", "Under Verification", "Accepted", "In Progress", "Resolved"]
    assert all(event["actor_id"] and event["created_at"] for event in detail["events"])


def test_rejection_and_invalid_transition_preserve_history(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    staff_login(client)
    assert change(client, report_id, "Resolved").status_code == 409
    assert change(client, report_id, "Under Verification").status_code == 200
    assert change(client, report_id, "Accepted").status_code == 422
    assert change(client, report_id, "Rejected", note="Not a valid barangay concern").status_code == 200
    assert change(client, report_id, "Accepted", verified_category="flooding").status_code == 409
    detail = client.get(f"/reports/{report_id}").json()
    assert [event["to_status"] for event in detail["events"]] == ["Pending", "Under Verification", "Rejected"]


def test_resident_cannot_forge_status_or_role(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    assert change(client, report_id, "Under Verification").status_code == 403
    assert client.get(f"/reports/{report_id}").json()["status"] == "Pending"


def test_staff_actions_are_visible_in_history(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    staff_login(client)
    response = client.post(f"/reports/{report_id}/actions", json={"kind": "coordination", "note": "Called local maintenance desk"},
                           headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})
    assert response.status_code == 201, response.text
    action = client.get(f"/reports/{report_id}").json()["actions"][0]
    assert action["kind"] == "coordination"
    assert action["actor_id"] and action["created_at"]
