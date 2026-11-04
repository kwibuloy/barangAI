from datetime import UTC, datetime

from test_cases import PASSWORD, headers, login, resident_report, walk
from test_workflow import staff_login

PERIOD = {"from": "2026-10-01", "to": "2026-10-31"}


def backdate(report_id, created, steps=None):
    from barangai.db import session_for_url
    from barangai.models import Report, ReportEvent

    with session_for_url() as db:
        db.get(Report, report_id).created_at = created
        for event in db.query(ReportEvent).filter_by(report_id=report_id):
            event.created_at = (steps or {}).get(event.to_status, created)
        db.commit()


def test_counts_come_from_the_records_and_group_incidents(client, photo):
    resolved = resident_report(client, photo, "ana@example.test", resident_category="potholes")
    rejected = resident_report(client, photo, "ben@example.test", resident_category="flooding")
    joined = resident_report(client, photo, "cy@example.test", resident_category="flooding")
    other_month = resident_report(client, photo, "di@example.test")
    staff_login(client)
    walk(client, resolved, "Under Verification", "Accepted", "In Progress", "Resolved", category="potholes")
    walk(client, rejected, "Under Verification", "Rejected")
    assert (
        client.post(
            "/cases/link", json={"report_id": joined, "other_report_id": resolved}, headers=headers(client)
        ).status_code
        == 409
    )  # Closed cases take no more reports.
    backdate(
        resolved,
        datetime(2026, 10, 10, 0, 0, tzinfo=UTC),
        {"Accepted": datetime(2026, 10, 10, 2, 0, tzinfo=UTC), "Resolved": datetime(2026, 10, 11, 0, 0, tzinfo=UTC)},
    )
    backdate(rejected, datetime(2026, 10, 12, 0, 0, tzinfo=UTC))
    backdate(joined, datetime(2026, 10, 13, 0, 0, tzinfo=UTC))
    backdate(other_month, datetime(2026, 9, 1, 0, 0, tzinfo=UTC))

    data = client.get("/staff/records", params=PERIOD).json()
    assert data["received"] == {"reports": 3, "incidents": 3}
    assert data["resolved"]["reports"] == 1 and data["rejected"]["reports"] == 1
    assert data["median_hours_to_accept"] == 2.0 and data["median_hours_to_resolve"] == 24.0
    assert data["verified_categories"] == [{"category": "potholes", "reports": 1}]
    assert data["not_yet_verified"] == 1  # Rejected reports are counted as rejected, not as waiting.
    assert data["rejection_reasons"] == [{"reason": "not_enough_details", "reports": 1}]
    assert data["open_now"]["total"] == 2 and data["open_now"]["over_30_days"] >= 1


def test_period_edges_are_whole_manila_days(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    # 1 Oct 00:30 in Manila is still 30 Sep in UTC, and belongs to October.
    backdate(report, datetime(2026, 9, 30, 16, 30, tzinfo=UTC))
    assert client.get("/staff/records", params=PERIOD).json()["received"]["reports"] == 1
    assert (
        client.get("/staff/records", params={"from": "2026-09-01", "to": "2026-09-30"}).json()["received"]["reports"]
        == 0
    )


def test_no_measurement_is_invented_for_an_empty_period(client):
    staff_login(client)
    data = client.get("/staff/records", params=PERIOD).json()
    assert data["median_hours_to_resolve"] is None and data["received"]["reports"] == 0


def test_residents_cannot_read_records(client, photo):
    resident_report(client, photo, "ana@example.test")
    assert client.get("/staff/records", params=PERIOD).status_code == 403
    assert client.get("/staff/records.csv", params=PERIOD).status_code == 403
    client.cookies.clear()
    assert client.get("/staff/records", params=PERIOD).status_code == 401


def test_invalid_periods_are_refused(client):
    staff_login(client)
    assert client.get("/staff/records", params={"from": "2026-10-31", "to": "2026-10-01"}).status_code == 422
    assert client.get("/staff/records", params={"from": "2024-01-01", "to": "2026-01-01"}).status_code == 422


def load_two_barangays():
    from barangai.barangays import import_boundaries

    def square(name, west):
        return {"type": "Feature", "properties": {"name": name}, "geometry": {
            "type": "Polygon", "coordinates": [[[west, 14], [west + 1, 14], [west + 1, 15], [west, 15], [west, 14]]]}}

    import_boundaries({"type": "FeatureCollection", "features": [square("Alpha", 120), square("Beta", 122)]})


def staff_of(email, barangay):
    from barangai.auth import hasher
    from barangai.db import session_for_url
    from barangai.models import Barangay, User

    with session_for_url() as db:
        area = db.query(Barangay).filter_by(name=barangay).one()
        db.add(User(email=email, password_hash=hasher.hash(PASSWORD), role="staff", barangay_id=area.id))
        db.commit()


def test_staff_only_ever_see_their_own_barangay_including_in_exports(client, photo):
    from barangai.auth import hasher
    from barangai.db import session_for_url
    from barangai.models import User

    with session_for_url() as db:
        db.add(User(email="admin@example.test", password_hash=hasher.hash(PASSWORD), role="administrator"))
        db.commit()
    load_two_barangays()
    staff_of("alpha@example.test", "Alpha")
    alpha = resident_report(client, photo, "ana@example.test", latitude="14.5", longitude="120.5")
    beta = resident_report(client, photo, "ben@example.test", latitude="14.5", longitude="122.5")
    period = {"from": "2026-01-01", "to": "2026-12-31"}

    login(client, "alpha@example.test")
    data = client.get("/staff/records", params=period).json()
    assert data["barangay"] == "Alpha" and data["received"]["reports"] == 1
    # Asking for another barangay changes nothing for staff.
    assert client.get("/staff/records", params={**period, "barangay": "Beta"}).json()["received"]["reports"] == 1
    sheet = client.get("/staff/records.csv", params={**period, "barangay": "Beta"}).text
    assert f"#{alpha[:8].upper()}" in sheet and f"#{beta[:8].upper()}" not in sheet

    login(client, "admin@example.test")
    assert client.get("/staff/records", params=period).json()["received"]["reports"] == 2
    assert client.get("/staff/records", params={**period, "barangay": "Beta"}).json()["received"]["reports"] == 1
    assert client.get("/staff/records", params={**period, "barangay": "outside"}).json()["received"]["reports"] == 0


def test_export_carries_no_personal_details_and_is_safe_to_open(client, photo):
    from barangai.db import session_for_url
    from barangai.models import Report

    email = "private-person@example.test"
    report = resident_report(client, photo, email, description="My neighbour Juan left it here")
    with session_for_url() as db:
        db.get(Report, report).location_label = "=HYPERLINK(1)"
        db.commit()
    staff_login(client)
    response = client.get("/staff/records.csv", params={"from": "2026-01-01", "to": "2026-12-31"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert response.text.startswith("﻿Reference,")
    assert email not in response.text and "Juan" not in response.text
    assert ",'=HYPERLINK(1)," in response.text
