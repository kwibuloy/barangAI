from conftest import register
from test_reports import submit
from test_workflow import staff_login

PASSWORD = "correct horse battery staple"


def login(client, email, password=PASSWORD):
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": email, "password": password}).status_code == 200


def headers(client):
    return {"X-CSRF-Token": client.cookies.get("csrf_token", "")}


def resident_report(client, photo, email, **fields):
    client.cookies.clear()
    if register(client, email=email).status_code != 201:
        login(client, email)
    response = submit(client, photo, **fields)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def walk(client, report_id, *statuses, category="flooding"):
    for status in statuses:
        body = {"status": status, "note": "Synthetic status note",
                **({"verified_category": category} if status == "Accepted" else {})}
        if status == "Rejected":
            body["rejection_reason"] = "not_enough_details"
        response = client.post(f"/reports/{report_id}/status", json=body, headers=headers(client))
        assert response.status_code == 200, response.text


def statuses(client, report_id):
    return [event["to_status"] for event in client.get(f"/reports/{report_id}").json()["events"]]


def test_staff_grouping_walks_every_report_along_the_required_path(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test", latitude="14.6001")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    assert client.post("/cases/link", json={"report_id": first, "other_report_id": second}).status_code == 403
    response = client.post("/cases/link", json={"report_id": second, "other_report_id": first}, headers=headers(client))
    assert response.status_code == 200, response.text
    case = response.json()["case"]
    assert case["reports"] == 2 and case["contributors"] == 2 and case["status"] == "Accepted"
    # The joining report went through every step, each one recorded.
    assert statuses(client, second) == ["Pending", "Under Verification", "Accepted"]
    assert client.get(f"/reports/{second}").json()["verified_category"] == "flooding"
    # A status change on either report moves the whole case.
    walk(client, second, "In Progress")
    assert client.get(f"/reports/{first}").json()["status"] == "In Progress"
    walk(client, first, "Resolved")
    assert client.get(f"/reports/{second}").json()["status"] == "Resolved"
    login(client, "ben@example.test")
    notices = [item["status"] for item in client.get("/notifications").json()]
    assert "Resolved" in notices and "Accepted" in notices
    # Residents see counts only, never the other reports.
    mine = client.get(f"/reports/{second}/case").json()["case"]
    assert mine["contributors"] == 2 and "members" not in mine


def test_rejected_reports_cannot_be_grouped_and_rejection_moves_the_case(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test")
    third = resident_report(client, photo, "cy@example.test")
    staff_login(client)
    assert client.post("/cases/link", json={"report_id": first, "other_report_id": first},
                       headers=headers(client)).status_code == 422
    assert client.post("/cases/link", json={"report_id": first, "other_report_id": second},
                       headers=headers(client)).status_code == 200
    walk(client, first, "Under Verification")
    response = client.post(f"/reports/{second}/status", json={"status": "Rejected", "rejection_reason": "no_problem_found", "note": "Nothing there when checked"}, headers=headers(client))
    assert response.status_code == 200, response.text
    rejected = client.get(f"/reports/{first}").json()
    assert rejected["status"] == "Rejected"
    assert rejected["events"][-1]["rejection_reason"] == "no_problem_found"
    assert rejected["events"][-1]["note"] == "Nothing there when checked"
    assert client.post("/cases/link", json={"report_id": first, "other_report_id": third},
                       headers=headers(client)).status_code == 409


def test_linking_reports_from_two_cases_merges_them(client, photo):
    ids = [resident_report(client, photo, f"r{index}@example.test") for index in range(4)]
    staff_login(client)
    first_case = client.post("/cases/link", json={"report_id": ids[0], "other_report_id": ids[1]},
                             headers=headers(client)).json()["case"]["id"]
    client.post("/cases/link", json={"report_id": ids[2], "other_report_id": ids[3]}, headers=headers(client))
    walk(client, ids[2], "Under Verification")
    merged = client.post("/cases/link", json={"report_id": ids[1], "other_report_id": ids[2]},
                         headers=headers(client)).json()["case"]
    assert merged["reports"] == 4 and merged["status"] == "Under Verification"
    assert {client.get(f"/reports/{report_id}").json()["case_id"] for report_id in ids} == {merged["id"]}
    assert merged["id"] == first_case
    again = client.post("/cases/link", json={"report_id": ids[0], "other_report_id": ids[3]}, headers=headers(client))
    assert again.status_code == 200 and again.json()["case"]["reports"] == 4


def test_community_map_shows_accepted_cases_without_private_details(client, photo):
    first = resident_report(client, photo, "ana@example.test", latitude="14.612345", description="Near my house")
    pending = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ben@example.test")
    cases = client.get("/cases/map").json()
    assert len(cases) == 1
    case = cases[0]
    assert case["latitude"] == 14.6123 and case["status"] == "Accepted" and case["contributors"] == 1
    assert case["open_for_evidence"] is True and case["contributed"] is False
    text = str(case)
    for private in ("Near my house", "image", "resident_id", "ana@", first, pending):
        assert private not in text
    client.cookies.clear()
    assert client.get("/cases/map").status_code == 401


def test_i_see_this_too_counts_only_after_staff_confirm(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    case_id = client.get(f"/reports/{first}/case").json()["case"]["id"]
    extra = resident_report(client, photo, "ben@example.test", case_id=case_id)
    assert client.get("/cases/map").json()[0]["contributed"] is True
    assert client.get("/cases/map").json()[0]["contributors"] == 1
    # Unknown or non-public cases look the same to residents.
    assert submit(client, photo, case_id="not-a-case").status_code == 404
    login(client, "staff@example.test", "staff-password-123")
    assert client.post(f"/reports/{extra}/status", json={"status": "Under Verification", "note": "Checking it"},
                       headers=headers(client)).status_code == 409
    response = client.post(f"/reports/{extra}/case/decision", json={"decision": "confirmed"}, headers=headers(client))
    assert response.status_code == 200, response.text
    assert response.json()["case"]["contributors"] == 2
    assert client.get(f"/reports/{extra}").json()["status"] == "Accepted"
    assert client.post(f"/reports/{extra}/case/decision", json={"decision": "confirmed"},
                       headers=headers(client)).status_code == 409
    walk(client, first, "In Progress", "Resolved")
    login(client, "ben@example.test")
    assert submit(client, photo, case_id=case_id).status_code == 409


def test_staff_can_send_a_wrong_i_see_this_too_back_to_its_own_review(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    case_id = client.get(f"/reports/{first}/case").json()["case"]["id"]
    extra = resident_report(client, photo, "ben@example.test", case_id=case_id)
    login(client, "staff@example.test", "staff-password-123")
    response = client.post(f"/reports/{extra}/case/decision", json={"decision": "rejected", "note": "Other street"},
                           headers=headers(client))
    assert response.status_code == 200 and response.json()["case"] is None
    report = client.get(f"/reports/{extra}").json()
    assert report["status"] == "Pending" and report["case_id"] is None
    assert "Other street" in report["actions"][0]["note"]


def test_new_reports_get_automatic_suggestions_within_the_category_radius(client, photo, monkeypatch):
    monkeypatch.setenv("VALIDATED_EMBEDDING_MODEL_VERSION", "validated-synthetic-v1")
    from barangai import ai
    from barangai.ai import Analysis

    def fake(_image):
        return Analysis(category=None, confidence=None, source=None, needs_check=False, problem_seen=True,
                        description=None, hazards=(), embedding=[1.0, 0.0], embedding_version="validated-synthetic-v1")

    monkeypatch.setattr(ai, "for_submission", fake)
    light = dict(resident_category="broken_streetlights")
    first = resident_report(client, photo, "ana@example.test", **light)
    near = resident_report(client, photo, "ben@example.test", latitude="14.60020", **light)  # about 22 m
    far = resident_report(client, photo, "cy@example.test", latitude="14.60100", **light)  # about 110 m
    staff_login(client)
    near_suggestions = client.get(f"/reports/{near}/duplicates").json()["suggestions"]
    assert [item["candidate_report_id"] for item in near_suggestions] == [first]
    assert client.get(f"/reports/{far}/duplicates").json()["suggestions"] == []


def test_merged_reports_take_the_staff_verified_category_never_a_residents(client, photo):
    accepted = resident_report(client, photo, "ana@example.test")
    pending = [resident_report(client, photo, f"p{index}@example.test") for index in range(3)]
    staff_login(client)
    walk(client, accepted, "Under Verification", "Accepted", category="potholes")
    # The bigger, still-pending case is kept; its residents chose "flooding", staff verified "potholes".
    client.post("/cases/link", json={"report_id": pending[0], "other_report_id": pending[1]}, headers=headers(client))
    client.post("/cases/link", json={"report_id": pending[1], "other_report_id": pending[2]}, headers=headers(client))
    case = client.post("/cases/link", json={"report_id": pending[2], "other_report_id": accepted, "confirm_far": True},
                       headers=headers(client)).json()["case"]
    assert case["status"] == "Accepted" and case["category"] == "potholes"
    for report_id in pending:
        report = client.get(f"/reports/{report_id}").json()
        assert report["resident_category"] == "flooding" and report["verified_category"] == "potholes"
    assert client.get("/cases/map").json()[0]["category"] == "potholes"


def test_staff_cannot_close_an_unreviewed_report_by_grouping_it_with_a_resolved_one(client, photo):
    resolved = resident_report(client, photo, "ana@example.test")
    fresh = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    walk(client, resolved, "Under Verification", "Accepted", "In Progress", "Resolved")
    response = client.post("/cases/link", json={"report_id": fresh, "other_report_id": resolved}, headers=headers(client))
    assert response.status_code == 409
    assert client.get(f"/reports/{fresh}").json()["status"] == "Pending"


def test_residents_learn_case_counts_and_days_only_once_the_case_is_public(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    client.post("/cases/link", json={"report_id": first, "other_report_id": second}, headers=headers(client))
    login(client, "ana@example.test")
    hidden = client.get(f"/reports/{first}/case").json()["case"]
    assert hidden["confirmed"] is True and hidden["contributors"] is None and hidden["reports"] is None
    login(client, "staff@example.test", "staff-password-123")
    walk(client, first, "Under Verification", "Accepted")
    login(client, "ana@example.test")
    assert client.get(f"/reports/{first}/case").json()["case"]["contributors"] == 2
    item = client.get("/cases/map").json()[0]
    assert len(item["first_reported_on"]) == 10 and "first_reported_at" not in item


def grouped_under_verification(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    second = resident_report(client, photo, "ben@example.test")
    staff_login(client)
    assert client.post("/cases/link", json={"report_id": first, "other_report_id": second},
                       headers=headers(client)).status_code == 200
    walk(client, first, "Under Verification")
    return first, second


def test_already_reported_cannot_reject_a_grouped_report(client, photo):
    first, second = grouped_under_verification(client, photo)
    body = {"status": "Rejected", "rejection_reason": "already_reported", "note": "Same pothole"}
    response = client.post(f"/reports/{second}/status", json=body, headers=headers(client))
    assert response.status_code == 409
    assert "grouped" in response.json()["detail"]
    assert client.get(f"/reports/{first}").json()["status"] == "Under Verification"


def test_already_reported_works_on_a_report_on_its_own(client, photo):
    report = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, report, "Under Verification")
    body = {"status": "Rejected", "rejection_reason": "already_reported", "note": "Same pothole"}
    assert client.post(f"/reports/{report}/status", json=body, headers=headers(client)).status_code == 200


def test_everyone_in_the_case_sees_the_status_description(client, photo):
    first, second = grouped_under_verification(client, photo)
    body = {"status": "Accepted", "verified_category": "potholes", "note": "A crew will check this road"}
    assert client.post(f"/reports/{first}/status", json=body, headers=headers(client)).status_code == 200
    login(client, "ben@example.test")
    last = client.get(f"/reports/{second}").json()["events"][-1]
    assert last["to_status"] == "Accepted"
    assert last["note"] == "A crew will check this road"
    assert "actor_id" not in last


def test_staff_correct_a_description_everywhere_and_keep_the_old_text_private(client, photo):
    first, second = grouped_under_verification(client, photo)
    body = {"status": "Accepted", "verified_category": "potholes", "note": "Ana Cruz told us about this road"}
    assert client.post(f"/reports/{first}/status", json=body, headers=headers(client)).status_code == 200
    event = client.get(f"/reports/{first}").json()["events"][-1]["id"]
    path = f"/reports/{first}/events/{event}/note"
    assert client.put(path, json={"note": "  "}, headers=headers(client)).status_code == 422
    corrected = client.put(path, json={"note": "A crew will check this road"}, headers=headers(client))
    assert corrected.status_code == 200, corrected.text
    assert any("Ana Cruz" in action["note"] for action in corrected.json()["actions"])
    pending = client.get(f"/reports/{first}").json()["events"][0]["id"]
    assert client.put(f"/reports/{first}/events/{pending}/note", json={"note": "x"},
                      headers=headers(client)).status_code == 409
    assert client.put(f"/reports/{first}/events/not-an-event/note", json={"note": "x"},
                      headers=headers(client)).status_code == 404
    for email, report in (("ana@example.test", first), ("ben@example.test", second)):
        login(client, email)
        detail = client.get(f"/reports/{report}").json()
        assert detail["events"][-1]["note"] == "A crew will check this road"
        assert "Ana Cruz" not in str(detail)
    assert client.put(path, json={"note": "x"}, headers=headers(client)).status_code == 403


def test_a_correction_leaves_an_earlier_decision_with_the_same_words(client, photo):
    from barangai.db import session_for_url
    from barangai.models import ReportEvent

    first, second = grouped_under_verification(client, photo)
    body = {"status": "Accepted", "verified_category": "potholes", "note": "Checking this"}
    assert client.post(f"/reports/{first}/status", json=body, headers=headers(client)).status_code == 200
    with session_for_url() as db:
        copy = db.query(ReportEvent).filter_by(report_id=second, to_status="Accepted").one()
        copy.created_at = copy.created_at.replace(year=copy.created_at.year - 1)
        db.commit()
    event = client.get(f"/reports/{first}").json()["events"][-1]["id"]
    assert client.put(f"/reports/{first}/events/{event}/note", json={"note": "A crew is coming"},
                      headers=headers(client)).status_code == 200
    assert client.get(f"/reports/{first}").json()["events"][-1]["note"] == "A crew is coming"
    other = client.get(f"/reports/{second}").json()["events"]
    assert next(item for item in other if item["to_status"] == "Accepted")["note"] == "Checking this"

