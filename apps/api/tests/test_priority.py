from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from test_cases import headers, login, resident_report, walk
from test_workflow import staff_login

TODAY = datetime(2026, 11, 1, tzinfo=UTC)


def report(category="potholes", resident="r1", days_ago=10, hazards=None, status="Pending", verified=None):
    return SimpleNamespace(
        resident_category=category,
        verified_category=verified,
        resident_id=resident,
        created_at=TODAY - timedelta(days=days_ago),
        hazards=hazards,
        status=status,
    )


def test_priority_adds_severity_hazards_independent_residents_and_recency_with_reasons():
    from barangai.priority import score

    assert score([report("damaged_signage")], TODAY) == {
        "level": "low",
        "score": 1,
        "reasons": [{"code": "category", "detail": "damaged_signage", "points": 1}],
    }
    wiring = score([report("exposed_wiring", days_ago=1, hazards=["electrical_hazard"])], TODAY)
    assert wiring["level"] == "high" and wiring["score"] == 6
    assert [reason["code"] for reason in wiring["reasons"]] == ["category", "hazard", "recent"]
    # Four reports from two residents count as two residents: one extra point, not three.
    crowd = [report(resident=resident) for resident in ("a", "a", "a", "b")]
    assert {"code": "residents", "detail": 2, "points": 1} in score(crowd, TODAY)["reasons"]
    # Residents add at most three points however many report it.
    many = score([report(resident=str(index)) for index in range(10)], TODAY)
    assert {"code": "residents", "detail": 10, "points": 3} in many["reasons"]


def test_priority_uses_the_staff_verified_category_and_skips_closed_reports():
    from barangai.priority import score

    verified = score([report("exposed_wiring", verified="damaged_signage")], TODAY)
    assert verified["reasons"][0] == {"code": "category", "detail": "damaged_signage", "points": 1}
    assert score([report(status="Resolved")], TODAY) is None
    assert score([report(status="Rejected")], TODAY) is None


def test_staff_see_one_priority_per_case_and_residents_never_see_it(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test")
    alone = resident_report(client, photo, "cy@example.test")
    staff_login(client)
    client.post("/cases/link", json={"report_id": first, "other_report_id": second}, headers=headers(client))
    listed = {item["id"]: item["priority"] for item in client.get("/reports").json()}
    assert listed[first] == listed[second]
    assert {"code": "residents", "detail": 2, "points": 1} in listed[first]["reasons"]
    assert not any(reason["code"] == "residents" for reason in listed[alone]["reasons"])
    assert client.get(f"/reports/{first}").json()["priority"] == listed[first]
    walk(client, alone, "Under Verification", "Rejected")
    assert client.get(f"/reports/{alone}").json()["priority"] is None
    login(client, "ana@example.test")
    assert "priority" not in client.get("/reports").json()[0]
    assert "priority" not in client.get(f"/reports/{first}").json()
