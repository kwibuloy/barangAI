from conftest import register
from test_reports import submit
from test_workflow import staff_login


def test_candidate_requires_category_distance_and_embedding_similarity():
    from barangai.duplicates import candidate_score

    assert candidate_score("flooding", 14.6, 121.0, [1.0, 0.0],
                           "flooding", 14.6002, 121.0002, [0.99, 0.01]) is not None
    assert candidate_score("flooding", 14.6, 121.0, [1.0, 0.0],
                           "potholes", 14.6002, 121.0002, [1.0, 0.0]) is None
    assert candidate_score("flooding", 14.6, 121.0, [1.0, 0.0],
                           "flooding", 15.0, 121.0, [1.0, 0.0]) is None
    assert candidate_score("flooding", 14.6, 121.0, [1.0, 0.0],
                           "flooding", 14.6002, 121.0002, [0.0, 1.0]) is None


def test_validated_embeddings_generate_staff_review_and_decision(client, photo, monkeypatch):
    register(client)
    first_id = submit(client, photo).json()["id"]
    second_id = submit(client, photo, latitude="14.6001").json()["id"]
    from barangai.db import session_for_url
    from barangai.models import Report

    with session_for_url() as db:
        for report_id in (first_id, second_id):
            report = db.get(Report, report_id)
            report.image_embedding = [1.0, 0.0]
            report.embedding_model_version = "validated-synthetic-v1"
        db.commit()
    monkeypatch.setenv("VALIDATED_EMBEDDING_MODEL_VERSION", "validated-synthetic-v1")
    staff_login(client)
    assert client.get(f"/reports/{first_id}/duplicates").json()["suggestions"] == []
    assert client.post(f"/reports/{first_id}/duplicates/generate").status_code == 403
    response = client.post(f"/reports/{first_id}/duplicates/generate",
                           headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["embedding_available"] is True
    assert len(body["suggestions"]) == 1
    suggestion = body["suggestions"][0]
    assert suggestion["candidate_report_id"] == second_id
    assert suggestion["decision"] == "pending"
    assert client.get(f"/reports/{first_id}/duplicates").json()["suggestions"][0]["id"] == suggestion["id"]
    again = client.post(f"/reports/{first_id}/duplicates/generate",
                        headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})
    assert [item["id"] for item in again.json()["suggestions"]] == [suggestion["id"]]
    decision = client.post(f'/duplicates/{suggestion["id"]}/decision', json={"decision": "rejected", "note": "Distinct incidents"},
                           headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})
    assert decision.status_code == 200, decision.text
    assert decision.json()["decision"] == "rejected"
    assert decision.json()["actor_id"] and decision.json()["decided_at"]
    assert client.get(f"/reports/{first_id}").json()["status"] == "Pending"
    assert client.get(f"/reports/{second_id}").json()["status"] == "Pending"


def test_new_model_version_keeps_old_decision_audit(client, photo, monkeypatch):
    register(client)
    first_id = submit(client, photo).json()["id"]
    second_id = submit(client, photo, latitude="14.6001").json()["id"]
    from barangai.db import session_for_url
    from barangai.models import DuplicateSuggestion, Report

    with session_for_url() as db:
        for report_id in (first_id, second_id):
            report = db.get(Report, report_id)
            report.image_embedding = [1.0, 0.0]
            report.embedding_model_version = "validated-synthetic-v1"
        db.commit()
    monkeypatch.setenv("VALIDATED_EMBEDDING_MODEL_VERSION", "validated-synthetic-v1")
    staff_login(client)
    headers = {"X-CSRF-Token": client.cookies.get("csrf_token", "")}
    old = client.post(f"/reports/{first_id}/duplicates/generate", headers=headers).json()["suggestions"][0]
    assert client.post(f'/duplicates/{old["id"]}/decision', json={"decision": "rejected"}, headers=headers).status_code == 200
    with session_for_url() as db:
        for report_id in (first_id, second_id):
            db.get(Report, report_id).embedding_model_version = "validated-synthetic-v2"
        db.commit()
    monkeypatch.setenv("VALIDATED_EMBEDDING_MODEL_VERSION", "validated-synthetic-v2")
    new = client.post(f"/reports/{first_id}/duplicates/generate", headers=headers).json()["suggestions"][0]
    assert new["id"] != old["id"]
    assert new["decision"] == "pending"
    with session_for_url() as db:
        rows = db.query(DuplicateSuggestion).filter_by(report_id=first_id).all()
        assert {(row.model_version, row.decision) for row in rows} == {
            ("validated-synthetic-v1", "rejected"), ("validated-synthetic-v2", "pending")}


def test_missing_validated_version_never_generates_suggestions(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    staff_login(client)
    response = client.get(f"/reports/{report_id}/duplicates")
    assert response.json() == {"embedding_available": False, "suggestions": [], "manual_review_required": True}
