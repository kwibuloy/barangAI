"""Grouping guards (no confirmed duplicate without a case, a check before an odd link) and cheap polls."""

from conftest import register
from sqlalchemy import event
from test_barangays import account, load_areas
from test_cases import headers, login, resident_report, walk
from test_reports import submit
from test_workflow import staff_login

FAR = {"latitude": "14.6200", "longitude": "121.0000"}  # About 2.2 km from the default pin.


def suggestion(first, second):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion

    with session_for_url() as db:
        item = DuplicateSuggestion(report_id=first, candidate_report_id=second, model_version="synthetic", score=0.9)
        db.add(item)
        db.commit()
        return item.id


def decide(client, suggestion_id, decision):
    return client.post(f"/duplicates/{suggestion_id}/decision", json={"decision": decision}, headers=headers(client))


def link(client, first, second, **extra):
    return client.post(
        "/cases/link", json={"report_id": first, "other_report_id": second, **extra}, headers=headers(client)
    )


def test_a_duplicate_cant_be_confirmed_when_the_pair_cant_be_grouped(client, photo):
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion

    resolved = resident_report(client, photo, "ana@example.test")
    rejected = resident_report(client, photo, "ben@example.test")
    fresh = resident_report(client, photo, "cara@example.test")
    staff_login(client)
    walk(client, resolved, "Under Verification", "Accepted", "In Progress", "Resolved")
    walk(client, rejected, "Under Verification", "Rejected")
    for other, message in ((resolved, "already resolved"), (rejected, "Rejected")):
        item = suggestion(fresh, other)
        answer = decide(client, item, "confirmed")
        assert answer.status_code == 409 and message in answer.json()["detail"], answer.text
        with session_for_url() as db:
            assert db.get(DuplicateSuggestion, item).decision == "pending"
        # Dismissing it stays possible.
        assert decide(client, item, "rejected").status_code == 200


def test_a_duplicate_with_an_unchecked_case_link_cant_be_confirmed(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    case = client.get(f"/reports/{first}/case").json()["case"]["id"]
    second = resident_report(client, photo, "ben@example.test", case_id=case)
    third = resident_report(client, photo, "cara@example.test")
    login(client, "staff@example.test", "staff-password-123")
    answer = decide(client, suggestion(third, second), "confirmed")
    assert answer.status_code == 409 and "case link" in answer.json()["detail"]


def test_a_reviewed_pair_groups_without_asking_again_even_in_related_categories(client, photo):
    """Automatic suggestions include related categories, and the website links right after the decision."""
    first = resident_report(client, photo, "ana@example.test", resident_category="flooding")
    second = resident_report(client, photo, "ben@example.test", resident_category="uncollected_garbage")
    staff_login(client)
    assert link(client, first, second).status_code == 409
    item = suggestion(second, first)
    assert decide(client, item, "confirmed").status_code == 200
    answer = link(client, first, second)
    assert answer.status_code == 200 and answer.json()["case"]["reports"] == 2


def test_linking_far_apart_reports_asks_first(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test", **FAR)
    staff_login(client)
    answer = link(client, first, second)
    assert answer.status_code == 409
    detail = answer.json()["detail"]
    assert detail["code"] == "confirm_far" and detail["reasons"] == ["far"]
    assert 2000 < detail["distance_m"] < 2500 and detail["categories"] == ["flooding", "flooding"]
    assert detail["message"]
    assert client.get(f"/reports/{first}/case").json()["case"] is None
    assert link(client, first, second, confirm_far=True).status_code == 200


def test_linking_different_categories_asks_first_and_uses_the_verified_one(client, photo):
    first = resident_report(client, photo, "ana@example.test", resident_category="flooding")
    second = resident_report(client, photo, "ben@example.test", resident_category="potholes")
    third = resident_report(client, photo, "cara@example.test", resident_category="flooding")
    staff_login(client)
    answer = link(client, first, second)
    assert answer.status_code == 409 and answer.json()["detail"]["reasons"] == ["category"]
    # Staff decided the first is really a pothole, so that's the category that counts.
    walk(client, first, "Under Verification", "Accepted", category="potholes")
    assert link(client, first, second).status_code == 200
    answer = link(client, first, third)
    assert answer.status_code == 409 and answer.json()["detail"]["categories"] == ["potholes", "flooding"]


def test_close_reports_of_one_category_link_without_asking(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test", latitude="14.6050")  # About 550 m away.
    staff_login(client)
    assert link(client, first, second).status_code == 200


def test_a_hard_refusal_wins_over_the_question(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test", **FAR)
    staff_login(client)
    walk(client, first, "Under Verification", "Rejected")
    answer = link(client, first, second)
    assert answer.status_code == 409 and answer.json()["detail"] == "Rejected reports cannot be grouped"


def conditional(client, path, tag=None):
    return client.get(path, headers={"If-None-Match": tag} if tag else {})


def test_an_unchanged_report_list_answers_304_and_a_change_does_not(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    first = conditional(client, "/reports")
    tag = first.headers["etag"]
    assert first.status_code == 200 and first.json()[0]["id"] == report
    assert first.headers["cache-control"] == "private, no-cache"
    again = conditional(client, "/reports", tag)
    assert again.status_code == 304 and again.content == b"" and again.headers["etag"] == tag
    assert conditional(client, "/reports", f'W/{tag}, "other"').status_code == 304
    assert conditional(client, "/reports", '"other"').status_code == 200

    staff_login(client)
    assert conditional(client, "/reports", tag).status_code == 200  # Another account's tag is never reused.
    staff_tag = conditional(client, "/reports").headers["etag"]
    walk(client, report, "Under Verification")
    assert conditional(client, "/reports", staff_tag).status_code == 200
    login(client, "ana@example.test")
    assert conditional(client, "/reports", tag).status_code == 200


def test_a_staff_list_changes_when_a_link_moves_no_updated_at(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    walk(client, first, "Under Verification")
    walk(client, second, "Under Verification")
    tag = conditional(client, "/reports").headers["etag"]
    assert link(client, first, second).status_code == 200
    assert conditional(client, "/reports", tag).status_code == 200


def test_an_unchanged_notice_list_answers_304_and_reading_one_does_not(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification")
    login(client, "ana@example.test")
    first = conditional(client, "/notifications")
    tag = first.headers["etag"]
    assert conditional(client, "/notifications", tag).status_code == 304
    item = first.json()[0]["id"]
    assert client.post(f"/notifications/{item}/read", headers=headers(client)).status_code == 200
    assert conditional(client, "/notifications", tag).status_code == 200


def test_signed_out_callers_get_401_not_a_304(client, photo):
    resident_report(client, photo, "ana@example.test")
    tag = conditional(client, "/reports").headers["etag"]
    client.cookies.clear()
    assert conditional(client, "/reports", tag).status_code == 401


def test_the_hosted_site_keeps_polls_revalidating_and_everything_else_unstored(client, photo, tmp_path):
    from barangai.main import create_app, site_app
    from fastapi.testclient import TestClient

    (tmp_path / "index.html").write_text("<title>Synthetic</title>")
    with TestClient(site_app(create_app(), tmp_path)) as browser:
        joined = browser.post(
            "/api/auth/register",
            json={"email": "ana@example.test", "password": "correct horse battery staple", "accepted_terms": True},
        )
        assert joined.status_code == 201
        polled = browser.get("/api/reports")
        assert polled.headers["cache-control"] == "private, no-cache" and polled.headers["etag"]
        assert "cookie" in polled.headers["vary"].lower()
        same = browser.get("/api/reports", headers={"If-None-Match": polled.headers["etag"]})
        assert same.status_code == 304 and same.headers["x-content-type-options"] == "nosniff"
        assert browser.get("/api/auth/me").headers["cache-control"] == "no-store"


def test_the_staff_list_stays_at_a_few_queries_with_many_barangays(client, photo):
    from barangai.db import database_url, engine_for_url, session_for_url
    from barangai.models import Barangay, Report

    load_areas()
    account("boss@example.test", "administrator")
    register(client, "ana@example.test")
    report = submit(client, photo, latitude="14.60", longitude="121.0").json()["id"]
    with session_for_url() as db:
        source = db.get(Report, report)
        for index in range(30):
            area = Barangay(name=f"Synthetic {index}", boundary={"type": "Polygon", "coordinates": []})
            db.add(area)
            db.flush()
            db.add(
                Report(
                    resident_id=source.resident_id,
                    latitude=14.6,
                    longitude=121.0,
                    resident_category="flooding",
                    image_path=source.image_path,
                    barangay_id=area.id,
                )
            )
        db.commit()
    login(client, "boss@example.test", "account-password-123")
    statements = []

    def count(_connection, _cursor, statement, *_rest):
        statements.append(statement)

    engine = engine_for_url(database_url())
    event.listen(engine, "before_cursor_execute", count)
    try:
        answer = client.get("/reports")
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert len(answer.json()) == 31
    assert {item["barangay"] for item in answer.json()} >= {"Synthetic 0", "Synthetic 29"}
    assert len(statements) <= 10, statements


def test_the_columns_lists_read_by_are_indexed(client):
    from barangai.db import database_url, engine_for_url
    from sqlalchemy import inspect

    inspector = inspect(engine_for_url(database_url()))
    for table, column in (
        ("reports", "resident_id"),
        ("report_events", "report_id"),
        ("staff_actions", "report_id"),
        ("notifications", "report_id"),
        ("duplicate_suggestions", "candidate_report_id"),
        ("sessions", "user_id"),
    ):
        assert any(index["column_names"] == [column] for index in inspector.get_indexes(table)), (table, column)


def test_two_accounts_with_identical_lists_never_share_a_tag(client):
    register(client, "ana@example.test")
    first = conditional(client, "/reports")
    client.cookies.clear()
    register(client, "ben@example.test")
    assert first.json() == [] and conditional(client, "/reports").json() == []
    assert conditional(client, "/reports", first.headers["etag"]).status_code == 200
