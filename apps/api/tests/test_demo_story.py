"""The recording dataset, the demo label, and what residents and administrators are shown from it."""

import base64
import io
import json
from collections import Counter
from datetime import UTC, datetime, timedelta

import pytest
from PIL import Image
from sqlalchemy import func, select
from test_cases import PASSWORD, headers, login, resident_report, walk
from test_records import PERIOD, backdate
from test_workflow import staff_login

MOMENT = datetime(2026, 11, 12, 3, 0, tzinfo=UTC)
SQUARE = {
    "type": "Polygon",
    "coordinates": [[[120.9, 14.3], [121.05, 14.3], [121.05, 14.7], [120.9, 14.7], [120.9, 14.3]]],
}
OTHER = {
    "type": "Polygon",
    "coordinates": [[[121.1, 14.3], [121.2, 14.3], [121.2, 14.4], [121.1, 14.4], [121.1, 14.3]]],
}


def run_story(client, tmp_path, moment=MOMENT, photos=None):
    from barangai.seed_story import seed_story

    return seed_story(
        "resident-pass-123456",
        "staff-pass-1234567",
        "admin-pass-1234567",
        moment=moment,
        photos=photos or tmp_path / "none",
    )


def signature():
    from barangai.db import session_for_url
    from barangai.models import Barangay, Report, User

    with session_for_url() as db:
        rows = db.execute(
            select(
                Barangay.name,
                User.email,
                Report.resident_category,
                Report.verified_category,
                Report.status,
                Report.created_at,
            )
            .join(Barangay, Report.barangay_id == Barangay.id)
            .join(User, Report.resident_id == User.id)
            .order_by(Report.created_at)
        ).all()
    return [tuple(row) for row in rows]


def load_area(name="North", boundary=SQUARE, *, role_email="admin-for-area@example.test"):
    from barangai.auth import hasher
    from barangai.barangays import import_boundaries
    from barangai.db import session_for_url
    from barangai.models import User

    with session_for_url() as db:
        if not db.scalar(select(User.id).where(User.email == role_email)):
            db.add(User(email=role_email, password_hash=hasher.hash(PASSWORD), role="administrator"))
            db.commit()
    import_boundaries({"type": "Feature", "properties": {"name": name}, "geometry": boundary})


def test_story_follows_the_workflow_inside_the_chosen_barangays(client, tmp_path):
    from barangai import barangays, points
    from barangai.db import session_for_url
    from barangai.models import Barangay, Case, PointEntry, Report, ReportEvent, Reward, User, Voucher
    from barangai.seed_story import STORY_BARANGAYS
    from barangai.workflow import NEXT, REJECTION_REASONS

    result = run_story(client, tmp_path)
    assert result["cc0_photos"] == []
    names = {name for name, _, _ in STORY_BARANGAYS}
    with session_for_url() as db:
        reports = db.scalars(select(Report)).all()
        assert result["reports"] == len(reports) > 150
        areas = {area.id: area for area in db.scalars(select(Barangay).where(Barangay.name.in_(names)))}
        assert len(areas) == 4
        for report in reports:
            assert report.barangay_id in areas
            assert barangays.contains(areas[report.barangay_id].boundary, report.latitude, report.longitude)
            assert report.model_category is None  # No invented model output.
            assert (report.verified_category is not None) == (report.status in {"Accepted", "In Progress", "Resolved"})
            previous = None
            for event in sorted(report.events, key=lambda item: item.created_at):
                if previous is not None:
                    assert event.to_status in NEXT[previous]
                    assert event.note and event.actor_id != report.resident_id
                previous = event.to_status
            assert previous == report.status
            if report.status == "Rejected":
                assert report.events[-1].rejection_reason in REJECTION_REASONS
            assert report.created_at.replace(tzinfo=UTC) <= MOMENT
        statuses = Counter(report.status for report in reports)
        assert all(statuses[status] for status in NEXT)
        assert len({event.rejection_reason for event in db.scalars(select(ReportEvent)) if event.rejection_reason}) >= 3
        # Some cases hold more than one report, and each case stays in one barangay.
        members = Counter(report.case_id for report in reports if report.case_id)
        assert max(members.values()) >= 2
        for case_id in members:
            assert len({report.barangay_id for report in reports if report.case_id == case_id}) == 1
        assert db.scalar(select(func.count()).select_from(Case)) == len(members)
        # A grouped case can't have been rejected as already reported: that would take the whole case with it.
        assert not [
            report
            for report in reports
            if report.status == "Rejected"
            and report.case_id
            and report.events[-1].rejection_reason == "already_reported"
        ]
        # One staff account per barangay, all tied to it, with no other kinds of account in the database.
        staff = db.scalars(select(User).where(User.role == "staff")).all()
        assert {user.barangay_id for user in staff} == set(areas) and len(staff) == 4
        assert db.scalar(select(func.count()).select_from(User).where(User.role == "administrator")) == 1
        assert all(user.email.endswith("@demo.test") for user in db.scalars(select(User)))
        # Rewards and codes were paid for from points earned through the real rules; no balance is negative.
        assert db.scalar(select(func.count()).select_from(Voucher)) > 0
        assert {voucher.status for voucher in db.scalars(select(Voucher))} >= {"active", "used"}
        assert db.scalar(select(func.count()).select_from(PointEntry).where(PointEntry.kind == "accepted")) > 50
        for user in db.scalars(select(User).where(User.role == "resident")):
            assert points.balance(db, user.id) >= 0
        assert {reward.barangay_id for reward in db.scalars(select(Reward))} == set(areas)


def test_story_is_the_same_each_time_and_improves_month_on_month(client, tmp_path, monkeypatch):
    run_story(client, tmp_path)
    first_run = signature()
    login(client, "admin@demo.test", "admin-pass-1234567")
    figures = [
        client.get("/staff/records", params={"from": start, "to": end}).json()
        for start, end in (("2026-08-01", "2026-08-31"), ("2026-09-01", "2026-09-30"), ("2026-10-01", "2026-10-31"))
    ]
    accept = [item["median_hours_to_accept"] for item in figures]
    resolve = [item["median_hours_to_resolve"] for item in figures]
    assert accept == sorted(accept, reverse=True) and resolve == sorted(resolve, reverse=True)
    assert 1 < accept[-1] < 60 and resolve[-1] > 24
    received = [item["received"]["reports"] for item in figures]
    assert received == sorted(received) and received[0] > 30
    assert (
        figures[-1]["previous"]["from"] == "2026-09-01"
        and figures[-1]["previous"]["received"] == figures[1]["received"]
    )

    # A second database, same clock, same story.
    from barangai.db import engine_for_url

    second = tmp_path / "second.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{second.as_posix()}")
    monkeypatch.setenv("PRIVATE_MEDIA_DIR", str(tmp_path / "second-private"))
    run_story(client, tmp_path)
    assert signature() == first_run
    from barangai.db import database_url

    engine_for_url(database_url()).dispose()


def test_story_refuses_a_database_with_anything_in_it(client, tmp_path, photo):
    resident_report(client, photo, "ana@example.test")
    with pytest.raises(SystemExit):
        run_story(client, tmp_path)


def test_story_uses_only_photos_recorded_as_cc0(client, tmp_path):
    from barangai.seed_story import recorded_cc0

    folder = tmp_path / "commons"
    folder.mkdir()
    for name in ("flooding", "potholes", "other"):
        Image.new("RGB", (900, 600), "gray").save(folder / f"{name}.jpg")
    (folder / "credits.json").write_text(
        json.dumps(
            {"flooding": {"license": "CC0"}, "potholes": {"license": "CC BY-SA 4.0"}, "no_such": {"license": "CC0"}}
        ),
        encoding="utf-8",
    )
    assert list(recorded_cc0(folder)) == ["flooding"]
    assert recorded_cc0(tmp_path / "missing") == {}


def test_drawn_scenes_are_not_flat_squares():
    import random

    from barangai.seed_story import SCENES

    for category, scene in SCENES.items():
        picture = scene(random.Random(1)).convert("RGB").resize((64, 48))
        colours = {picture.getpixel((x, y)) for x in range(64) for y in range(48)}
        assert len(colours) > 40, category


def test_demo_flag_is_public_and_off_by_default(client, monkeypatch):
    client.cookies.clear()
    assert client.get("/legal/operator").json()["demo_mode"] is False
    monkeypatch.setenv("DEMO_MODE", "true")
    assert client.get("/legal/operator").json()["demo_mode"] is True
    monkeypatch.setenv("DEMO_MODE", "1")
    assert client.get("/legal/operator").json()["demo_mode"] is False


def test_spreadsheets_say_they_hold_demo_data(client, photo, monkeypatch):
    resident_report(client, photo, "ana@example.test")
    staff_login(client)
    assert "Demo data" not in client.get("/staff/records.csv", params=PERIOD).text
    monkeypatch.setenv("DEMO_MODE", "true")
    assert client.get("/staff/records.csv", params=PERIOD).text.lstrip("﻿").startswith("Demo data")


def test_photo_preview_reports_what_it_blurred_and_the_cache_agrees(client, monkeypatch):
    from barangai import media, privacy
    from conftest import register

    register(client)
    calls = []

    def faces(_image):
        calls.append("faces")
        return [(10, 10, 40, 40), (100, 10, 40, 40)]

    monkeypatch.setattr(privacy, "find_faces", faces)
    monkeypatch.setattr(privacy, "find_plates", lambda _image: [(20, 100, 60, 20)])
    output = io.BytesIO()
    Image.new("RGB", (300, 200), (120, 140, 160)).save(output, format="JPEG")
    files = {"image": ("p.jpg", output.getvalue(), "image/jpeg")}
    token = {"X-CSRF-Token": client.cookies.get("csrf_token", "")}
    media.clear_sanitized_cache()
    answer = client.post("/reports/photo-preview", files=files, headers=token).json()
    again = client.post("/reports/photo-preview", files=files, headers=token).json()
    assert answer["faces_blurred"] == 2 and answer["plates_blurred"] == 1
    assert again == answer
    assert calls == ["faces"]  # The second call came from the cache, counts included.
    assert media.sanitize_photo(output.getvalue()).faces == 2
    assert base64.b64decode(answer["preview_image"].split(",", 1)[1]) == media.sanitize_image(output.getvalue())


def resolve_at(client, report_id, category, when, created=None):
    walk(client, report_id, "Under Verification", "Accepted", "In Progress", "Resolved", category=category)
    backdate(report_id, created or when - timedelta(days=2), {"Resolved": when})


def this_month():
    from barangai.usage import MANILA

    today = datetime.now(UTC).astimezone(MANILA)
    # Within the month whatever day the tests run: a moment earlier today.
    return today.replace(minute=0, second=0, microsecond=0).astimezone(UTC)


def test_fixed_summary_hides_figures_below_three_incidents(client, photo):
    load_area()
    reports = [
        resident_report(client, photo, f"r{index}@example.test", resident_category="potholes") for index in range(3)
    ]
    login(client, "admin-for-area@example.test")
    moment = this_month()
    for report in reports[:2]:
        resolve_at(client, report, "potholes", moment, created=moment - timedelta(days=4))
    data = client.get("/barangays/fixed", params={"barangay": "North"}).json()
    assert data == {
        "barangay": "North",
        "month": data["month"],
        "enough": False,
        "resolved_incidents": None,
        "typical_days": None,
        "categories": [],
    }
    resolve_at(client, reports[2], "potholes", moment, created=moment - timedelta(days=4))
    data = client.get("/barangays/fixed", params={"barangay": "North"}).json()
    assert data["enough"] is True
    assert data["resolved_incidents"] == 3 and data["typical_days"] == 4.0
    assert data["categories"] == [{"category": "potholes", "incidents": 3}]


def test_fixed_summary_counts_per_incident_with_verified_categories_and_only_this_month(client, photo):
    load_area()
    first = resident_report(client, photo, "r1@example.test", resident_category="flooding")
    joined = resident_report(client, photo, "r2@example.test", resident_category="flooding")
    two = resident_report(client, photo, "r3@example.test", resident_category="flooding")
    three = resident_report(client, photo, "r4@example.test", resident_category="flooding")
    old = resident_report(client, photo, "r5@example.test", resident_category="flooding")
    login(client, "admin-for-area@example.test")
    assert (
        client.post(
            "/cases/link", json={"report_id": joined, "other_report_id": first}, headers=headers(client)
        ).status_code
        == 200
    )
    moment = this_month()
    # The residents said flooding; staff verified potholes. The summary goes by staff.
    walk(client, first, "Under Verification", "Accepted", "In Progress", "Resolved", category="potholes")
    backdate(first, moment - timedelta(days=2), {"Resolved": moment})
    backdate(joined, moment - timedelta(days=2), {"Resolved": moment})
    resolve_at(client, two, "potholes", moment)
    resolve_at(client, three, "potholes", moment)
    resolve_at(client, old, "potholes", moment - timedelta(days=70))
    data = client.get("/barangays/fixed", params={"lat": 14.35, "lng": 120.95}).json()
    assert data["barangay"] == "North"
    assert data["resolved_incidents"] == 3  # Two reports of one incident count once; last season's doesn't count.
    assert data["categories"] == [{"category": "potholes", "incidents": 3}]


def test_fixed_summary_says_nothing_of_a_category_below_three_and_gives_only_counts(client, photo):
    load_area()
    reports = [
        resident_report(client, photo, f"r{index}@example.test", resident_category="potholes") for index in range(4)
    ]
    login(client, "admin-for-area@example.test")
    moment = this_month()
    for report, category in zip(reports, ("potholes", "potholes", "potholes", "flooding"), strict=True):
        resolve_at(client, report, category, moment)
    answer = client.get("/barangays/fixed", params={"barangay": "North"})
    data = answer.json()
    assert set(data) == {"barangay", "month", "enough", "resolved_incidents", "typical_days", "categories"}
    assert data["categories"] == [{"category": "potholes", "incidents": 3}]
    for private in (reports[0], "hazards", "description", "example.test", "latitude", "location_label", "actor"):
        assert private not in answer.text


def test_fixed_summary_is_for_people_signed_in_and_handles_unknown_places(client, photo):
    assert client.get("/barangays/fixed", params={"barangay": "North"}).status_code == 401
    load_area()
    resident_report(client, photo, "ana@example.test")
    assert client.get("/barangays/fixed").status_code == 422
    assert client.get("/barangays/fixed", params={"barangay": "Nowhere"}).json()["barangay"] is None
    outside = client.get("/barangays/fixed", params={"lat": 1.0, "lng": 1.0}).json()
    assert outside["barangay"] is None and outside["enough"] is False


def test_previous_period_is_the_month_before_and_a_running_month_stops_at_the_same_day(client, photo):
    from datetime import date

    from barangai.records import previous_period

    today = date(2026, 11, 5)
    assert previous_period(date(2026, 10, 1), date(2026, 10, 31), today) == (date(2026, 9, 1), date(2026, 9, 30))
    assert previous_period(date(2026, 11, 1), date(2026, 11, 30), today) == (date(2026, 10, 1), date(2026, 10, 5))
    assert previous_period(date(2026, 3, 1), date(2026, 3, 31), date(2026, 3, 31)) == (
        date(2026, 2, 1),
        date(2026, 2, 28),
    )
    assert previous_period(date(2026, 1, 1), date(2026, 1, 31), today) == (date(2025, 12, 1), date(2025, 12, 31))
    assert previous_period(date(2026, 10, 11), date(2026, 10, 20), today) == (date(2026, 10, 1), date(2026, 10, 10))


def test_comparison_counts_the_earlier_month_by_the_same_rules(client, photo):
    this_one = resident_report(client, photo, "ana@example.test", resident_category="potholes")
    earlier = resident_report(client, photo, "ben@example.test", resident_category="potholes")
    staff_login(client)
    walk(client, earlier, "Under Verification", "Accepted", "In Progress", "Resolved", category="potholes")
    backdate(
        earlier,
        datetime(2026, 9, 10, 0, 0, tzinfo=UTC),
        {"Accepted": datetime(2026, 9, 10, 4, 0, tzinfo=UTC), "Resolved": datetime(2026, 9, 12, 0, 0, tzinfo=UTC)},
    )
    backdate(this_one, datetime(2026, 10, 10, 0, 0, tzinfo=UTC))
    data = client.get("/staff/records", params=PERIOD).json()
    assert data["received"]["reports"] == 1 and data["resolved"]["reports"] == 0
    assert data["previous"]["from"] == "2026-09-01" and data["previous"]["to"] == "2026-09-30"
    assert data["previous"]["received"] == {"reports": 1, "incidents": 1}
    assert data["previous"]["resolved"] == {"reports": 1, "incidents": 1}
    assert data["previous"]["median_hours_to_accept"] == 4.0 and data["previous"]["median_hours_to_resolve"] == 48.0
    empty = client.get("/staff/records", params={"from": "2026-08-01", "to": "2026-08-31"}).json()["previous"]
    assert empty["received"]["reports"] == 0 and empty["median_hours_to_resolve"] is None


def test_rollup_is_for_administrators_and_matches_the_monthly_figures(client, photo):
    load_area("North", SQUARE)
    load_area("Zeta", OTHER)
    north = resident_report(
        client, photo, "ana@example.test", resident_category="potholes", latitude=14.35, longitude=120.95
    )
    joined = resident_report(
        client, photo, "ben@example.test", resident_category="potholes", latitude=14.35, longitude=120.95
    )
    zeta = resident_report(
        client, photo, "cy@example.test", resident_category="flooding", latitude=14.35, longitude=121.15
    )
    outside = resident_report(client, photo, "di@example.test", resident_category="other", latitude=1.0, longitude=1.0)
    client.cookies.clear()

    login(client, "ana@example.test")
    assert client.get("/staff/records/rollup", params=PERIOD).status_code == 403
    assert client.get("/staff/records/rollup.csv", params=PERIOD).status_code == 403
    client.cookies.clear()
    assert client.get("/staff/records/rollup", params=PERIOD).status_code == 401
    from barangai.auth import hasher
    from barangai.db import session_for_url
    from barangai.models import Barangay, User

    with session_for_url() as db:
        area = db.scalar(select(Barangay).where(Barangay.name == "North"))
        db.add(User(email="staff-only@example.test", password_hash=hasher.hash(PASSWORD), role="staff", barangay_id=area.id))
        db.commit()
    login(client, "staff-only@example.test")
    assert client.get("/staff/records/rollup", params=PERIOD).status_code == 403
    assert client.get("/staff/records/rollup.csv", params=PERIOD).status_code == 403
    client.cookies.clear()

    login(client, "admin-for-area@example.test")
    assert (
        client.post(
            "/cases/link", json={"report_id": joined, "other_report_id": north}, headers=headers(client)
        ).status_code
        == 200
    )
    walk(client, north, "Under Verification", "Accepted", "In Progress", "Resolved", category="potholes")
    october = datetime(2026, 10, 10, 0, 0, tzinfo=UTC)
    backdate(north, october, {"Resolved": october + timedelta(hours=24)})
    backdate(joined, october, {"Resolved": october + timedelta(hours=24)})
    backdate(zeta, datetime(2026, 8, 1, 0, 0, tzinfo=UTC))  # Old and still open: over 30 days.
    backdate(outside, october)

    data = client.get("/staff/records/rollup", params=PERIOD).json()
    assert [row["barangay"] for row in data["rows"]] == ["North", "Zeta", None]
    north_row, zeta_row, outside_row = data["rows"]
    assert north_row["received"] == {"reports": 2, "incidents": 1}
    assert north_row["resolved"] == {"reports": 2, "incidents": 1}
    assert north_row["median_hours_to_resolve"] == 24.0 and north_row["open_over_30_days"] == 0
    assert zeta_row["received"]["reports"] == 0 and zeta_row["open_over_30_days"] == 1
    assert outside_row["received"] == {"reports": 1, "incidents": 1}
    monthly = client.get("/staff/records", params=PERIOD).json()
    assert data["total"]["received"] == monthly["received"] and data["total"]["resolved"] == monthly["resolved"]
    assert data["total"]["median_hours_to_resolve"] == monthly["median_hours_to_resolve"]
    assert data["quiet_barangays"] == 0
    assert set(north_row) == {"barangay", "received", "resolved", "median_hours_to_resolve", "open_over_30_days"}

    sheet = client.get("/staff/records/rollup.csv", params=PERIOD)
    assert (
        sheet.headers["content-disposition"].endswith('.csv"') and "attachment" in sheet.headers["content-disposition"]
    )
    rows = [line.split(",") for line in sheet.text.lstrip("﻿").strip().splitlines()]
    assert rows[0][:3] == ["Barangay", "Reports received", "Incidents received"]
    assert [row[0] for row in rows[1:]] == ["North", "Zeta", "Outside every boundary", "All barangays"]
    assert rows[1][1:5] == ["2", "1", "2", "1"]
    for private in ("@", "example.test", north[:8].upper()):
        assert private not in sheet.text


def test_rollup_counts_quiet_barangays_and_the_sheet_lists_them(client):
    load_area("North", SQUARE)
    load_area("Zeta", OTHER)
    login(client, "admin-for-area@example.test")
    data = client.get("/staff/records/rollup", params=PERIOD).json()
    assert data["rows"] == [] and data["quiet_barangays"] == 2
    sheet = client.get("/staff/records/rollup.csv", params=PERIOD).text
    assert "North" in sheet and "Zeta" in sheet
