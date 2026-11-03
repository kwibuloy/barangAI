from conftest import register
from test_reports import submit
from test_workflow import change, staff_login


def test_status_change_notifies_only_report_owner_and_can_be_marked_read(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    staff_login(client)
    assert change(client, report_id, "Under Verification").status_code == 200

    client.cookies.clear()
    register(client, "other@example.test")
    assert client.get("/notifications").json() == []

    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "resident@example.test",
                                             "password": "correct horse battery staple"}).status_code == 200
    items = client.get("/notifications").json()
    assert len(items) == 1
    assert items[0]["report_id"] == report_id
    assert items[0]["status"] == "Under Verification"
    assert items[0]["read_at"] is None
    notification_id = items[0]["id"]
    assert client.post(f"/notifications/{notification_id}/read").status_code == 403
    response = client.post(f"/notifications/{notification_id}/read",
                           headers={"X-CSRF-Token": client.cookies["csrf_token"]})
    assert response.status_code == 200
    assert response.json()["read_at"] is not None
    assert client.get("/notifications").json()[0]["read_at"] is not None

    client.cookies.clear()
    register(client, "third@example.test")
    assert client.post(f"/notifications/{notification_id}/read",
                       headers={"X-CSRF-Token": client.cookies["csrf_token"]}).status_code == 404
