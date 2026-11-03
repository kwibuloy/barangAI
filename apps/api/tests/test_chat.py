import httpx
import pytest
from conftest import register
from test_reports import submit
from test_workflow import staff_login


def chat(client, message, language="en", report_id=None):
    payload = {"message": message, "language": language}
    if report_id:
        payload["report_id"] = report_id
    return client.post("/chat", json=payload, headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})


def test_chat_uses_explicit_deterministic_fallback_in_three_languages(client):
    register(client)
    for language in ("en", "fil", "taglish"):
        response = chat(client, "How do I report flooding?", language)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["language"] == language
        assert data["source"] == "deterministic"
        assert data["llm_available"] is False
        assert data["reply"]
    assert chat(client, "help", "unknown").status_code == 422


def test_chat_report_status_is_scoped_to_resident(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    assert "Pending" in chat(client, "status", report_id=report_id).json()["reply"]
    client.cookies.clear()
    register(client, "other@example.test")
    assert chat(client, "status", report_id=report_id).status_code == 404


def test_workers_ai_receives_only_curated_topic_and_language(client, monkeypatch):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    private_message = "Flooding near SECRET_PERSON_72 at private lane 0192, report 123e4567-e89b-12d3-a456-426614174000"
    seen = []

    def fake_post(url, **kwargs):
        seen.append((url, kwargs))
        assert url == f"https://api.cloudflare.com/client/v4/accounts/{'a' * 32}/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct"
        assert kwargs["timeout"] == 8.0
        assert kwargs["headers"]["Authorization"] == "Bearer synthetic-token"
        outgoing = str(kwargs["json"])
        assert "SECRET_PERSON_72" not in outgoing
        assert "private lane" not in outgoing
        assert "0192" not in outgoing
        assert "123e4567-e89b-12d3-a456-426614174000" not in outgoing
        assert "flooding" in outgoing.lower()
        assert "Filipino" in outgoing
        return httpx.Response(200, json={"success": True, "result": {"response": "Lumayo sa rumaragasang baha at mag-ulat sa barangay."}})

    monkeypatch.setattr(httpx, "post", fake_post)
    result = chat(client, private_message, "fil")
    assert result.status_code == 200, result.text
    assert result.json()["source"] == "workers_ai"
    assert result.json()["llm_available"] is True
    assert "barangay" in result.json()["reply"]
    assert len(seen) == 1


def test_workers_ai_429_falls_back_without_claiming_llm_answer(client, monkeypatch):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: httpx.Response(429, json={"success": False}))
    result = chat(client, "How should I report garbage?")
    assert result.status_code == 200
    assert result.json()["source"] == "deterministic"
    assert result.json()["llm_available"] is False


def test_report_tracking_never_calls_workers_ai(client, photo, monkeypatch):
    register(client)
    report_id = submit(client, photo).json()["id"]
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")

    def forbidden_call(*args, **kwargs):
        raise AssertionError("report tracking must stay local")

    monkeypatch.setattr(httpx, "post", forbidden_call)
    response = chat(client, "What is my status?", report_id=report_id)
    assert response.status_code == 200
    assert response.json()["source"] == "deterministic"
    assert "Pending" in response.json()["reply"]


@pytest.mark.parametrize("provider_result", [
    httpx.Response(200, json=[]),
    httpx.Response(200, json={"success": True, "result": {"response": "https://invented.example/contact"}}),
])
def test_malformed_or_unsafe_workers_ai_response_falls_back(client, monkeypatch, provider_result):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: provider_result)
    response = chat(client, "How do I report a pothole?")
    assert response.status_code == 200
    assert response.json()["source"] == "deterministic"


def test_workers_ai_network_error_falls_back(client, monkeypatch):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")

    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "post", unavailable)
    assert chat(client, "How do I report a pothole?").json()["source"] == "deterministic"


def test_duplicate_review_does_not_invent_hybrid_suggestions(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    assert client.get(f"/reports/{report_id}/duplicates").status_code == 403
    staff_login(client)
    response = client.get(f"/reports/{report_id}/duplicates")
    assert response.status_code == 200, response.text
    assert response.json() == {"embedding_available": False, "suggestions": [], "manual_review_required": True}


def test_upload_is_rate_limited(client, photo):
    register(client)
    for _ in range(10):
        assert submit(client, photo).status_code == 201
    assert submit(client, photo).status_code == 429


@pytest.mark.parametrize("status,translated", [
    ("Pending", "Naghihintay"), ("Under Verification", "Sinusuri"),
    ("Accepted", "Tinanggap"), ("In Progress", "Isinasagawa"),
    ("Resolved", "Nalutas"), ("Rejected", "Tinanggihan"),
])
def test_filipino_tracking_localizes_the_actual_report_status(client, photo, status, translated):
    from barangai.db import session_for_url
    from barangai.models import Report

    register(client)
    report_id = submit(client, photo).json()["id"]
    with session_for_url() as db:
        db.get(Report, report_id).status = status
        db.commit()
    response = chat(client, "Ano na ang ulat ko?", "fil", report_id)
    assert response.json()["reply"] == f"Ang katayuan ng iyong ulat ay {translated}."
    assert response.json()["source"] == "deterministic"
