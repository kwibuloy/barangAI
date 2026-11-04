"""Ledger sequences: deletion after spending, merges that would pay twice, and the Manila calendar day."""

from datetime import timedelta

from test_barangays import account, load_areas
from test_cases import headers, login, resident_report, walk
from test_points import balance, give_points, staff_of
from test_reports import submit
from test_workflow import staff_login


def link(client, first, second):
    answer = client.post(
        "/cases/link",
        json={"report_id": first, "other_report_id": second, "confirm_far": True},
        headers=headers(client),
    )
    assert answer.status_code == 200, answer.text


def entries(email, kind):
    from barangai.db import session_for_url
    from barangai.models import PointEntry, User

    with session_for_url() as db:
        user = db.query(User).filter_by(email=email).one()
        return [item.amount for item in db.query(PointEntry).filter_by(user_id=user.id, kind=kind).all()]


def owed(email):
    from barangai.db import session_for_url
    from barangai.models import User

    with session_for_url() as db:
        return db.query(User).filter_by(email=email).one().points_owed


def erase(report_id):
    from barangai.db import session_for_url
    from barangai.delete_report import erase_rows
    from barangai.models import Report

    with session_for_url() as db:
        erase_rows(db, db.get(Report, report_id))
        db.commit()


def expire_vouchers():
    from barangai.db import session_for_url
    from barangai.models import Voucher, now

    with session_for_url() as db:
        for voucher in db.query(Voucher).all():
            voucher.expires_at = now() - timedelta(days=1)
        db.commit()


def spend_it_all(client, cost):
    """Ana (signed in) turns all her points into a code."""
    load_areas()
    account("south@example.test", "staff", "South")
    area = next(item["id"] for item in client.get("/rewards/barangays").json() if item["name"] == "South")
    staff_of(client, "south@example.test")
    reward = client.post("/rewards", json={"name": "Certificate", "points_cost": cost}, headers=headers(client)).json()
    client.cookies.clear()
    login(client, "ana@example.test")
    assert area and client.post(f"/rewards/{reward['id']}/redeem", headers=headers(client)).status_code == 201
    assert balance(client) == 0


def test_points_spent_before_deletion_come_out_of_the_refund_when_the_code_expires(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 25
    spend_it_all(client, 25)

    erase(report)
    # Nothing to take back yet, and the balance stays at zero.
    assert balance(client) == 0 and owed("ana@example.test") == 25
    assert client.get("/points").json()["owed"] == 25

    expire_vouchers()
    # The refund comes in and goes straight back, so the deleted report pays nothing.
    assert balance(client) == 0
    assert owed("ana@example.test") == 0
    assert entries("ana@example.test", "refund") == [25] and entries("ana@example.test", "reversal") == [-25]


def test_only_what_is_owed_comes_out_of_a_bigger_refund(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    give_points(75)
    spend_it_all(client, 100)
    erase(report)
    assert owed("ana@example.test") == 25
    expire_vouchers()
    assert balance(client) == 75
    assert owed("ana@example.test") == 0


def test_a_small_refund_leaves_the_rest_owed_for_the_next(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted", "In Progress", "Resolved")
    login(client, "ana@example.test")
    assert balance(client) == 35
    spend_it_all(client, 35)
    erase(report)
    assert owed("ana@example.test") == 35

    from barangai.db import session_for_url
    from barangai.models import Voucher

    # Pretend it cost less, so one refund can't cover what is owed.
    with session_for_url() as db:
        db.query(Voucher).one().points_cost = 10
        db.commit()
    expire_vouchers()
    assert balance(client) == 0 and owed("ana@example.test") == 25


def test_a_used_code_keeps_what_is_owed_without_going_below_zero(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    spend_it_all(client, 25)
    erase(report)
    give_points(10)
    # New points aren't touched: only a refund pays what is owed.
    assert balance(client) == 10 and owed("ana@example.test") == 25


def test_two_of_one_residents_paid_reports_merged_pay_once(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.33", longitude="120.94").json()["id"]
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, second, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 50

    login(client, "staff@example.test", "staff-password-123")
    link(client, first, second)
    login(client, "ana@example.test")
    assert balance(client) == 25
    assert entries("ana@example.test", "merge") == [-25]

    # Linking again changes nothing, and the rest of the path pays once.
    login(client, "staff@example.test", "staff-password-123")
    link(client, first, second)
    walk(client, first, "In Progress", "Resolved")
    login(client, "ana@example.test")
    assert balance(client) == 35
    assert entries("ana@example.test", "merge") == [-25] and entries("ana@example.test", "resolved") == [10]


def test_taking_back_a_merge_never_goes_below_zero(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.33", longitude="120.94").json()["id"]
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, second, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    give_points(-40)
    assert balance(client) == 10
    login(client, "staff@example.test", "staff-password-123")
    link(client, first, second)
    login(client, "ana@example.test")
    assert balance(client) == 0 and owed("ana@example.test") == 15
    assert entries("ana@example.test", "merge") == [-10]


def test_two_groups_merged_keep_one_first_reporter_bonus(client, photo):
    ana = resident_report(client, photo, "ana@example.test")
    ben = resident_report(client, photo, "ben@example.test")
    cara = resident_report(client, photo, "cara@example.test", latitude="14.33", longitude="120.94")
    dan = resident_report(client, photo, "dan@example.test", latitude="14.33", longitude="120.94")
    staff_login(client)
    link(client, ana, ben)
    link(client, cara, dan)
    walk(client, ana, "Under Verification", "Accepted")
    walk(client, cara, "Under Verification", "Accepted")
    for email, points in (("ana", 30), ("ben", 25), ("cara", 30), ("dan", 25)):
        login(client, f"{email}@example.test")
        assert balance(client) == points, email

    login(client, "staff@example.test", "staff-password-123")
    link(client, ben, dan)
    # The earliest report's bonus stays. Everyone keeps their one acceptance.
    for email, points in (("ana", 30), ("ben", 25), ("cara", 25), ("dan", 25)):
        login(client, f"{email}@example.test")
        assert balance(client) == points, email
    assert entries("cara@example.test", "merge") == [-5]
    assert entries("ana@example.test", "merge") == []


def test_one_resident_in_both_groups_is_paid_once_when_they_merge(client, photo):
    ana = resident_report(client, photo, "ana@example.test")
    ben = resident_report(client, photo, "ben@example.test")
    again = resident_report(client, photo, "ana@example.test", latitude="14.33", longitude="120.94")
    cara = resident_report(client, photo, "cara@example.test", latitude="14.33", longitude="120.94")
    staff_login(client)
    link(client, ana, ben)
    link(client, again, cara)
    walk(client, ana, "Under Verification", "Accepted")
    walk(client, again, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 60  # Two acceptances and two bonuses.
    login(client, "staff@example.test", "staff-password-123")
    link(client, ben, cara)
    login(client, "ana@example.test")
    assert balance(client) == 30
    assert sorted(entries("ana@example.test", "merge")) == [-25, -5]


def test_deleting_the_report_that_kept_the_award_lets_the_other_earn_it_again(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.33", longitude="120.94").json()["id"]
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, second, "Under Verification", "Accepted")
    link(client, first, second)
    login(client, "ana@example.test")
    assert balance(client) == 25
    erase(first)
    assert balance(client) == 0
    login(client, "staff@example.test", "staff-password-123")
    walk(client, second, "In Progress")
    login(client, "ana@example.test")
    assert balance(client) == 25


def test_deleting_the_report_whose_award_was_taken_back_takes_nothing_more(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.33", longitude="120.94").json()["id"]
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, second, "Under Verification", "Accepted")
    link(client, first, second)
    login(client, "ana@example.test")
    erase(second)
    assert balance(client) == 25 and owed("ana@example.test") == 0


def test_the_daily_cap_is_the_manila_calendar_day_not_the_last_24_hours(client, photo, monkeypatch):
    from barangai.db import session_for_url
    from barangai.models import PointEntry, User
    from barangai.usage import day_start

    monkeypatch.setenv("MAX_REWARDED_REPORTS_PER_DAY", "1")
    first = resident_report(client, photo, "ana@example.test")
    second = submit(client, photo, latitude="14.40", longitude="120.99").json()["id"]
    with session_for_url() as db:
        user = db.query(User).filter_by(email="ana@example.test").one()
        # A minute before midnight: inside the last 24 hours, but yesterday.
        db.add(PointEntry(user_id=user.id, kind="accepted", amount=25, created_at=day_start() - timedelta(minutes=1)))
        db.commit()
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 50
    # Today's one is used now.
    login(client, "staff@example.test", "staff-password-123")
    walk(client, second, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert balance(client) == 50


def test_midnight_is_midnight_in_manila():
    from datetime import UTC, datetime

    from barangai import usage

    original = usage.now
    try:
        # 16:30 UTC is already 00:30 the next day in Manila.
        usage.now = lambda: datetime(2026, 11, 4, 16, 30, tzinfo=UTC)
        assert usage.day_start() == datetime(2026, 11, 4, 16, 0, tzinfo=UTC)
        usage.now = lambda: datetime(2026, 11, 4, 15, 30, tzinfo=UTC)
        assert usage.day_start() == datetime(2026, 11, 3, 16, 0, tzinfo=UTC)
    finally:
        usage.now = original


def test_administrators_can_trace_any_code_and_any_price(client, photo):
    load_areas()
    account("south@example.test", "staff", "South")
    account("boss@example.test", "administrator")
    resident_report(client, photo, "ana@example.test", latitude="14.40", longitude="120.99")
    give_points(100)
    staff_of(client, "south@example.test")
    reward = client.post(
        "/rewards", json={"name": "Certificate", "points_cost": 50, "stock": 2}, headers=headers(client)
    ).json()
    assert (
        client.patch(f"/rewards/{reward['id']}", json={"points_cost": 60}, headers=headers(client)).status_code == 200
    )
    # Nothing changed, so nothing to log.
    assert (
        client.patch(f"/rewards/{reward['id']}", json={"points_cost": 60}, headers=headers(client)).status_code == 200
    )
    login(client, "ana@example.test")
    code = client.post(f"/rewards/{reward['id']}/redeem", headers=headers(client)).json()["code"]
    assert client.get("/admin/rewards/log").status_code == 403
    staff_of(client, "south@example.test")
    assert client.get("/admin/rewards/log").status_code == 403
    assert client.post("/vouchers/use", json={"code": code}, headers=headers(client)).status_code == 200
    desk = client.get("/auth/me").json()["id"]

    staff_of(client, "boss@example.test")
    log = client.get("/admin/rewards/log").json()
    assert sorted(item["action"] for item in log["reward_changes"]) == ["changed", "created"]
    changes = {item["action"]: item["changes"] for item in log["reward_changes"]}
    assert changes["changed"] == {"points_cost": [50, 60]}
    assert changes["created"]["points_cost"] == 50
    assert all(item["actor_id"] == desk and item["reward"] == "Certificate" for item in log["reward_changes"])
    voucher = log["vouchers"][0]
    assert voucher["code"] == code and voucher["status"] == "used" and voucher["barangay"] == "South"
    assert voucher["honoured_by"] == desk and voucher["honoured_at"] and voucher["redeemed_at"]
    assert "email" not in str(log)
    # Find one code as it is read out at a counter.
    assert client.get("/admin/rewards/log", params={"code": f" {code.lower()} "}).json()["vouchers"] == [voucher]
    assert client.get("/admin/rewards/log", params={"code": "NOSUCHCODE"}).json()["vouchers"] == []


def test_a_merge_gives_the_bonus_to_whoever_reported_first(client, photo):
    first = resident_report(client, photo, "xena@example.test")
    yara = resident_report(client, photo, "yara@example.test", latitude="14.33", longitude="120.94")
    zed = resident_report(client, photo, "zed@example.test", latitude="14.33", longitude="120.94")
    staff_login(client)
    link(client, yara, zed)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, yara, "Under Verification", "Accepted")
    login(client, "yara@example.test")
    assert balance(client) == 30  # First of her group, for now.
    login(client, "staff@example.test", "staff-password-123")
    link(client, first, zed)
    for email, points in (("xena", 30), ("yara", 25), ("zed", 25)):
        login(client, f"{email}@example.test")
        assert balance(client) == points, email
    assert entries("yara@example.test", "merge") == [-5]


def test_the_bonus_stays_when_the_first_reporter_has_not_been_paid(client, photo, monkeypatch):
    from barangai.db import session_for_url
    from barangai.models import PointEntry, User

    first = resident_report(client, photo, "xena@example.test")
    yara = resident_report(client, photo, "yara@example.test", latitude="14.33", longitude="120.94")
    zed = resident_report(client, photo, "zed@example.test", latitude="14.33", longitude="120.94")
    # Xena reached today's limit, so her report paid nothing.
    monkeypatch.setenv("MAX_REWARDED_REPORTS_PER_DAY", "1")
    with session_for_url() as db:
        xena = db.query(User).filter_by(email="xena@example.test").one()
        db.add(PointEntry(user_id=xena.id, kind="accepted", amount=25))
        db.commit()
    staff_login(client)
    link(client, yara, zed)
    walk(client, first, "Under Verification", "Accepted")
    walk(client, yara, "Under Verification", "Accepted")
    login(client, "staff@example.test", "staff-password-123")
    link(client, first, zed)
    login(client, "yara@example.test")
    assert balance(client) == 30
