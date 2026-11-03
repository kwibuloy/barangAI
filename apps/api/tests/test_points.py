from datetime import timedelta

import pytest
from conftest import register
from test_barangays import NORTH, SOUTH, account, load_areas
from test_cases import headers, login, resident_report, walk
from test_reports import submit
from test_workflow import staff_login

STAFF_PASSWORD = "account-password-123"


def staff_of(client, email):
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": email, "password": STAFF_PASSWORD}).status_code == 200


def balance(client):
    return client.get("/points").json()["balance"]


def area_id(client, name):
    return next(item["id"] for item in client.get("/rewards/barangays").json() if item["name"] == name)


def give_points(amount, email="ana@example.test"):
    from barangai.db import session_for_url
    from barangai.models import PointEntry, User

    with session_for_url() as db:
        user = db.query(User).filter_by(email=email).one()
        db.add(PointEntry(user_id=user.id, kind="accepted", amount=amount))
        db.commit()


@pytest.fixture
def shop(client):
    """Two barangays with staff, a resident and a reward in South."""
    load_areas()
    account("north@example.test", "staff", "North")
    account("south@example.test", "staff", "South")
    register(client, "ana@example.test")
    south, north = area_id(client, "South"), area_id(client, "North")
    staff_of(client, "south@example.test")
    made = client.post(
        "/rewards", json={"name": "Barangay certificate", "points_cost": 250, "stock": 1}, headers=headers(client)
    )
    assert made.status_code == 201, made.text
    client.cookies.clear()
    login(client, "ana@example.test")
    return {"reward": made.json()["id"], "south": south, "north": north}


def test_points_come_from_acceptance_and_resolution_only(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    assert balance(client) == 0
    staff_login(client)
    walk(client, report, "Under Verification")
    login(client, "ana@example.test")
    assert balance(client) == 0
    login(client, "staff@example.test", "staff-password-123")
    walk(client, report, "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 25
    login(client, "staff@example.test", "staff-password-123")
    walk(client, report, "In Progress")
    login(client, "ana@example.test")
    assert balance(client) == 25
    login(client, "staff@example.test", "staff-password-123")
    walk(client, report, "Resolved")
    login(client, "ana@example.test")
    assert balance(client) == 35
    assert [item["kind"] for item in client.get("/points").json()["history"]].count("resolved") == 1


def test_a_rejected_report_earns_nothing(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Rejected")
    login(client, "ana@example.test")
    assert balance(client) == 0


def test_everyone_in_a_group_earns_and_the_first_reporter_gets_extra(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    assert (
        client.post(
            "/cases/link", json={"report_id": first, "other_report_id": second}, headers=headers(client)
        ).status_code
        == 200
    )
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 30
    login(client, "ben@example.test")
    assert balance(client) == 25


def test_a_report_on_its_own_gets_no_first_reporter_bonus(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 25


def test_one_resident_is_paid_once_for_one_incident(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.33", longitude="120.94").json()["id"]
    staff_login(client)
    assert (
        client.post(
            "/cases/link", json={"report_id": first, "other_report_id": second}, headers=headers(client)
        ).status_code
        == 200
    )
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 25


def test_rewarded_reports_are_capped_per_day(client, photo, monkeypatch):
    monkeypatch.setenv("MAX_REWARDED_REPORTS_PER_DAY", "1")
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.40", longitude="120.99").json()["id"]
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, second, "Under Verification", "Accepted", "In Progress", "Resolved")
    login(client, "ana@example.test")
    assert balance(client) == 25


def test_deleting_a_report_takes_its_points_back_but_not_below_zero(client, photo):
    from barangai.db import session_for_url
    from barangai.delete_report import erase_rows
    from barangai.models import PointEntry, Report

    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 25
    give_points(-20)
    with session_for_url() as db:
        erase_rows(db, db.get(Report, report))
        db.commit()
    assert balance(client) == 0
    with session_for_url() as db:
        assert not db.query(PointEntry).filter_by(report_id=report).count()


def test_any_resident_sees_any_barangays_shop_and_redeems_a_single_use_code(client, shop):
    assert [item["name"] for item in client.get("/rewards", params={"barangay_id": shop["south"]}).json()] == [
        "Barangay certificate"
    ]
    assert client.get("/rewards", params={"barangay_id": shop["north"]}).json() == []
    assert client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client)).status_code == 409
    give_points(300)
    made = client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client))
    assert made.status_code == 201, made.text
    code = made.json()["code"]
    assert balance(client) == 50
    mine = client.get("/vouchers").json()
    assert [item["code"] for item in mine["available"]] == [code] and mine["history"] == []
    # The only one in stock is gone, so a second can't be had even with the points.
    give_points(300)
    assert client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client)).status_code == 409

    staff_of(client, "north@example.test")
    assert client.post("/vouchers/use", json={"code": code}, headers=headers(client)).status_code == 404
    staff_of(client, "south@example.test")
    used = client.post("/vouchers/use", json={"code": f" {code.lower()} "}, headers=headers(client))
    assert used.status_code == 200 and used.json()["status"] == "used"
    assert "user_id" not in used.json() and "email" not in used.json()
    assert client.post("/vouchers/use", json={"code": code}, headers=headers(client)).status_code == 409

    client.cookies.clear()
    login(client, "ana@example.test")
    mine = client.get("/vouchers").json()
    assert mine["available"] == [] and [item["status"] for item in mine["history"]] == ["used"]
    assert client.post("/vouchers/use", json={"code": code}, headers=headers(client)).status_code == 403


def test_unused_codes_expire_and_refund_points_and_stock(client, shop):
    from barangai.db import session_for_url
    from barangai.models import Reward, Voucher, now

    give_points(250)
    code = client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client)).json()["code"]
    assert balance(client) == 0
    with session_for_url() as db:
        db.query(Voucher).filter_by(code=code).one().expires_at = now() - timedelta(days=1)
        db.commit()
    assert balance(client) == 250
    assert [item["status"] for item in client.get("/vouchers").json()["history"]] == ["expired"]
    assert balance(client) == 250
    with session_for_url() as db:
        assert db.get(Reward, shop["reward"]).stock == 1
    staff_of(client, "south@example.test")
    answer = client.post("/vouchers/use", json={"code": code}, headers=headers(client))
    assert answer.status_code == 409 and "expired" in answer.json()["detail"]


def test_staff_manage_only_their_own_barangays_rewards(client, shop):
    staff_of(client, "north@example.test")
    path = f"/rewards/{shop['reward']}"
    assert client.patch(path, json={"points_cost": 1}, headers=headers(client)).status_code == 404
    assert client.get("/rewards/manage", params={"barangay_id": shop["south"]}).json() == []
    # A staff member's reward goes to their own barangay, whatever they ask for.
    made = client.post(
        "/rewards",
        json={"name": "Court lights", "points_cost": 750, "barangay_id": shop["south"]},
        headers=headers(client),
    )
    assert made.json()["barangay_id"] == shop["north"]
    staff_of(client, "south@example.test")
    hidden = client.patch(path, json={"active": False}, headers=headers(client))
    assert hidden.status_code == 200 and hidden.json()["active"] is False
    client.cookies.clear()
    login(client, "ana@example.test")
    assert client.get("/rewards", params={"barangay_id": shop["south"]}).json() == []
    give_points(500)
    assert client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client)).status_code == 404


def test_administrators_manage_any_barangay_and_must_choose_one(client, shop):
    staff_of(client, "admin@example.test")
    assert (
        client.post("/rewards", json={"name": "Lights", "points_cost": 750}, headers=headers(client)).status_code == 422
    )
    made = client.post(
        "/rewards", json={"name": "Lights", "points_cost": 750, "barangay_id": shop["north"]}, headers=headers(client)
    )
    assert made.status_code == 201
    assert len(client.get("/rewards/manage").json()) == 2
    assert (
        client.patch(f"/rewards/{shop['reward']}", json={"points_cost": 300}, headers=headers(client)).json()[
            "points_cost"
        ]
        == 300
    )


def test_residents_cannot_manage_and_staff_have_no_points(client, shop):
    assert client.post("/rewards", json={"name": "Mine", "points_cost": 1}, headers=headers(client)).status_code == 403
    assert (
        client.patch(f"/rewards/{shop['reward']}", json={"points_cost": 1}, headers=headers(client)).status_code == 403
    )
    assert client.get("/rewards/manage").status_code == 403
    staff_of(client, "south@example.test")
    assert client.get("/points").status_code == 403
    assert client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client)).status_code == 403


def test_deleting_an_account_removes_points_and_codes_and_returns_stock(client, shop):
    from barangai.db import session_for_url
    from barangai.models import PointEntry, Reward, Voucher

    give_points(250)
    assert client.post(f"/rewards/{shop['reward']}/redeem", headers=headers(client)).status_code == 201
    answer = client.post(
        "/auth/delete-account",
        json={"email": "ana@example.test", "password": "correct horse battery staple"},
        headers=headers(client),
    )
    assert answer.status_code == 204, answer.text
    with session_for_url() as db:
        assert not db.query(PointEntry).count() and not db.query(Voucher).count()
        assert db.get(Reward, shop["reward"]).stock == 1


def test_points_need_the_report_to_be_placed_only_by_its_own_status(client, photo, shop):
    """A report's barangay doesn't limit which shop the points are spent in."""
    report = submit(client, photo, **NORTH).json()["id"]
    assert submit(client, photo, **SOUTH).status_code == 201
    staff_of(client, "north@example.test")
    walk(client, report, "Under Verification", "Accepted")
    client.cookies.clear()
    login(client, "ana@example.test")
    assert balance(client) == 25


def test_redeeming_at_the_same_moment_cannot_overspend(client, shop):
    from concurrent.futures import ThreadPoolExecutor

    from barangai.db import session_for_url
    from barangai.models import Reward
    from fastapi.testclient import TestClient

    with session_for_url() as db:
        db.get(Reward, shop["reward"]).stock = None
        db.commit()
    give_points(250)
    cookies = dict(client.cookies)
    token = headers(client)

    def attempt(_):
        with TestClient(client.app, cookies=cookies) as caller:
            return caller.post(f"/rewards/{shop['reward']}/redeem", headers=token).status_code

    with ThreadPoolExecutor(6) as pool:
        answers = list(pool.map(attempt, range(6)))
    assert sorted(answers) == [201, 409, 409, 409, 409, 409]
    assert balance(client) == 0


def test_the_first_reporter_keeps_the_bonus_with_two_reports_in_the_group(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    extra = submit(client, photo, latitude="14.33", longitude="120.94").json()["id"]
    other = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    for report in (extra, other):
        assert client.post("/cases/link", json={"report_id": first, "other_report_id": report},
                           headers=headers(client)).status_code == 200
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 30


def test_an_award_can_be_switched_off(client, photo, monkeypatch):
    monkeypatch.setenv("POINTS_RESOLVED", "0")
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted", "In Progress", "Resolved")
    login(client, "ana@example.test")
    assert balance(client) == 25


def test_sample_rewards_are_labelled_and_seeding_twice_adds_none(client):
    from barangai.db import session_for_url
    from barangai.models import Reward
    from barangai.seed_demo import seed_rewards

    load_areas()
    assert seed_rewards() > 0
    assert seed_rewards() == 0
    with session_for_url() as db:
        assert all(item.name.startswith("Sample: ") for item in db.query(Reward).all())

