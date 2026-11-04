"""Disabling accounts, the photo-view log and the administrators' staff screen API."""

from conftest import register
from test_barangays import account, load_areas
from test_cases import PASSWORD, headers, login, resident_report

STAFF_PASSWORD = "account-password-123"


def rows(model, **filters):
    from barangai.db import session_for_url

    with session_for_url() as db:
        items = db.query(model).filter_by(**filters).all()
        db.expunge_all()
        return items


def admin(client, email="boss@example.test"):
    if not rows(_user(), email=email):
        account(email, "administrator")
    login(client, email, STAFF_PASSWORD)


def _user():
    from barangai.models import User

    return User


def user_id(email):
    return rows(_user(), email=email)[0].id


def create(client, **body):
    return client.post("/admin/staff", json=body, headers=headers(client))


def test_disabling_staff_ends_the_session_and_refuses_sign_in_with_the_generic_message(client):
    from barangai.models import LoginSession

    account("desk@example.test", "staff")
    login(client, "desk@example.test", STAFF_PASSWORD)
    desk_cookies = dict(client.cookies)
    target = user_id("desk@example.test")
    assert rows(LoginSession, user_id=target)

    client.cookies.clear()
    admin(client)
    answer = client.patch(f"/admin/staff/{target}", json={"disabled": True}, headers=headers(client))
    assert answer.status_code == 200 and answer.json()["disabled"] is True
    assert not rows(LoginSession, user_id=target)

    client.cookies.clear()
    client.cookies.update(desk_cookies)
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()
    wrong = client.post("/auth/login", json={"email": "desk@example.test", "password": "not the password"})
    right = client.post("/auth/login", json={"email": "desk@example.test", "password": STAFF_PASSWORD})
    assert right.status_code == wrong.status_code == 401 and right.json() == wrong.json()

    admin(client)
    assert client.patch(f"/admin/staff/{target}", json={"disabled": False}, headers=headers(client)).status_code == 200
    client.cookies.clear()
    login(client, "desk@example.test", STAFF_PASSWORD)
    assert client.get("/auth/me").status_code == 200


def test_a_session_left_behind_stops_working_the_moment_the_account_is_disabled(client):
    from barangai.db import session_for_url
    from barangai.models import User, now

    register(client, "ana@example.test")
    assert client.get("/auth/me").status_code == 200
    with session_for_url() as db:
        db.query(User).filter_by(email="ana@example.test").one().disabled_at = now()
        db.commit()
    assert client.get("/auth/me").status_code == 401
    assert client.put("/auth/preferences", json={"theme": "dark"}, headers=headers(client)).status_code == 401


def test_the_command_line_can_ban_a_resident(client):
    from barangai.bootstrap_staff import set_disabled

    register(client, "ana@example.test")
    set_disabled("ana@example.test", True)
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "ana@example.test", "password": PASSWORD}).status_code == 401
    set_disabled("ana@example.test", False)
    login(client, "ana@example.test")


def test_staff_opening_a_photo_is_logged_once_an_hour_and_residents_are_not(client, photo):
    from barangai.db import session_for_url
    from barangai.delete_report import erase_rows
    from barangai.models import Report, ReportPhotoView, now

    report = resident_report(client, photo, "ana@example.test")
    assert client.get(f"/reports/{report}/image").status_code == 200
    assert not rows(ReportPhotoView)

    account("desk@example.test", "staff")
    login(client, "desk@example.test", STAFF_PASSWORD)
    desk = user_id("desk@example.test")
    assert client.get(f"/reports/{report}/image").status_code == 200
    assert client.get(f"/reports/{report}/image").status_code == 200
    views = rows(ReportPhotoView)
    assert [(item.report_id, item.actor_id) for item in views] == [(report, desk)]

    # An older view doesn't stand in for this one.
    from datetime import timedelta

    with session_for_url() as db:
        db.query(ReportPhotoView).one().created_at = now() - timedelta(hours=2)
        db.commit()
    assert client.get(f"/reports/{report}/image").status_code == 200
    assert len(rows(ReportPhotoView)) == 2

    # Administrators can read it; nobody else can, and a resident's report never carries it.
    assert client.get(f"/admin/reports/{report}/photo-views").status_code == 403
    login(client, "ana@example.test")
    assert client.get(f"/admin/reports/{report}/photo-views").status_code == 403
    assert "photo" not in str(client.get(f"/reports/{report}").json().keys()).replace("image", "")
    admin(client)
    assert {item["actor_id"] for item in client.get(f"/admin/reports/{report}/photo-views").json()} == {desk}

    with session_for_url() as db:
        erase_rows(db, db.get(Report, report))
        db.commit()
    assert not rows(ReportPhotoView)


def test_added_photos_are_logged_too(client, photo):
    from barangai.models import ReportPhotoView

    report = resident_report(client, photo, "ana@example.test")
    added = client.post(
        f"/reports/{report}/addenda",
        data={"note": "Synthetic extra"},
        files={"image": ("more.jpg", photo, "image/jpeg")},
        headers=headers(client),
    ).json()
    account("desk@example.test", "staff")
    login(client, "desk@example.test", STAFF_PASSWORD)
    assert client.get(added["image_url"].removeprefix("/api")).status_code == 200
    assert len(rows(ReportPhotoView, report_id=report)) == 1


def test_administrators_create_staff_with_a_password_shown_once(client):
    from barangai.auth import password_problem

    load_areas()
    admin(client)
    assert [item["name"] for item in client.get("/admin/barangays").json()] == ["North", "South"]
    assert create(client, email="new@example.test", role="staff").status_code == 422  # Staff need a barangay.
    assert create(client, email="new@example.test", role="staff", barangay="Nowhere").status_code == 422
    assert create(client, email="new@example.test", role="resident", barangay="North").status_code == 422
    assert create(client, email="new@example.test", role="administrator", barangay="North").status_code == 422
    made = create(client, email="New@Example.test", role="staff", barangay="North")
    assert made.status_code == 201, made.text
    body = made.json()
    password = body.pop("temporary_password")
    assert body == {
        "id": body["id"],
        "email": "new@example.test",
        "role": "staff",
        "barangay": "North",
        "disabled": False,
        "must_change_password": True,
    }
    assert len(password) >= 12 and password_problem(password, "new@example.test") is None
    assert create(client, email="new@example.test", role="staff", barangay="North").status_code == 409

    listed = client.get("/admin/staff").json()
    assert {"boss@example.test", "new@example.test"} <= {item["email"] for item in listed}
    assert all("temporary_password" not in item and "password_hash" not in item for item in listed)

    client.cookies.clear()
    login(client, "new@example.test", password)
    assert client.get("/auth/me").json()["barangay"] == "North"


def test_moving_staff_and_barangay_rules(client):
    load_areas()
    account("desk@example.test", "staff", "North")
    admin(client)
    desk, boss = user_id("desk@example.test"), user_id("boss@example.test")
    moved = client.patch(f"/admin/staff/{desk}", json={"barangay": "South"}, headers=headers(client))
    assert moved.json()["barangay"] == "South"
    assert client.patch(f"/admin/staff/{desk}", json={"barangay": None}, headers=headers(client)).status_code == 422
    assert client.patch(f"/admin/staff/{boss}", json={"barangay": "South"}, headers=headers(client)).status_code == 422
    assert client.patch(f"/admin/staff/{desk}", json={"barangay": "Nope"}, headers=headers(client)).status_code == 422


def test_an_administrator_cannot_disable_themself_and_residents_are_not_staff(client):
    register(client, "ana@example.test")
    resident = user_id("ana@example.test")
    admin(client)
    boss = user_id("boss@example.test")
    answer = client.patch(f"/admin/staff/{boss}", json={"disabled": True}, headers=headers(client))
    assert answer.status_code == 409
    assert client.get("/auth/me").status_code == 200
    # Not through here: a resident's password needs an identity check at the hall.
    assert client.post(f"/admin/staff/{resident}/reset-password", headers=headers(client)).status_code == 404
    assert client.patch(f"/admin/staff/{resident}", json={"disabled": True}, headers=headers(client)).status_code == 404
    assert client.post(f"/admin/staff/{boss}/reset-password", headers=headers(client)).status_code == 409


def test_a_reset_gives_one_new_password_and_signs_the_account_out(client):
    from barangai.models import LoginSession

    account("desk@example.test", "staff")
    login(client, "desk@example.test", STAFF_PASSWORD)
    desk = user_id("desk@example.test")
    admin(client)
    answer = client.post(f"/admin/staff/{desk}/reset-password", headers=headers(client))
    assert answer.status_code == 200 and set(answer.json()) == {"temporary_password"}
    assert not rows(LoginSession, user_id=desk)
    client.cookies.clear()
    assert (
        client.post("/auth/login", json={"email": "desk@example.test", "password": STAFF_PASSWORD}).status_code == 401
    )
    login(client, "desk@example.test", answer.json()["temporary_password"])


def test_only_administrators_reach_the_staff_routes(client):
    load_areas()
    account("desk@example.test", "staff", "North")
    desk = user_id("desk@example.test")
    for email, password in (("desk@example.test", STAFF_PASSWORD), ("ana@example.test", PASSWORD)):
        client.cookies.clear()
        if email.startswith("ana"):
            register(client, email)
        else:
            login(client, email, password)
        token = headers(client)
        assert client.get("/admin/staff").status_code == 403
        assert client.get("/admin/barangays").status_code == 403
        assert (
            client.post("/admin/staff", json={"email": "x@example.test", "role": "staff"}, headers=token).status_code
            == 403
        )
        assert client.patch(f"/admin/staff/{desk}", json={"disabled": True}, headers=token).status_code == 403
        assert client.post(f"/admin/staff/{desk}/reset-password", headers=token).status_code == 403
    client.cookies.clear()
    assert client.get("/admin/staff").status_code == 401


def test_changing_staff_needs_csrf_and_is_rate_limited(client):
    account("desk@example.test", "staff")
    admin(client)
    desk = user_id("desk@example.test")
    assert client.post(f"/admin/staff/{desk}/reset-password").status_code == 403
    answers = [
        client.post(f"/admin/staff/{desk}/reset-password", headers=headers(client)).status_code for _ in range(11)
    ]
    assert answers[:10] == [200] * 10 and answers[10] == 429
