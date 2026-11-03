import json

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


def kap_says(monkeypatch, reply, on_topic=True):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    answer = json.dumps({"on_topic": on_topic, "reply": reply})
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *args, **kwargs: httpx.Response(200, json={"success": True, "result": {"response": answer}}),
    )


def test_kap_gets_the_question_without_private_details(client, monkeypatch):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    message = "Flooding here, call 0917 123 4567 or ana@example.test, report 123e4567-e89b-12d3-a456-426614174000"
    seen = []

    def fake_post(url, **kwargs):
        seen.append((url, kwargs))
        assert (
            url
            == f"https://api.cloudflare.com/client/v4/accounts/{'a' * 32}/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct"
        )
        assert kwargs["timeout"] == httpx.Timeout(15.0, connect=5.0)
        assert kwargs["headers"]["Authorization"] == "Bearer synthetic-token"
        outgoing = str(kwargs["json"])
        assert "0917" not in outgoing
        assert "ana@example.test" not in outgoing
        assert "123e4567" not in outgoing
        assert "Flooding here" in outgoing
        assert "You are Kap" in outgoing
        assert "in Filipino" in outgoing
        reply = json.dumps({"on_topic": True, "reply": "Lumayo sa rumaragasang baha at mag-ulat sa barangay."})
        return httpx.Response(200, json={"success": True, "result": {"response": reply}})

    monkeypatch.setattr(httpx, "post", fake_post)
    result = chat(client, message, "fil")
    assert result.status_code == 200, result.text
    assert result.json()["source"] == "workers_ai"
    assert result.json()["llm_available"] is True
    assert "barangay" in result.json()["reply"]
    assert len(seen) == 1


@pytest.mark.parametrize(
    "detail",
    ["0917.123.4567", "0917/123/4567", "+63(917)1234567", "(0917) 123-4567", "ana@example", "123e4567e89b12d3a456426614174000"],
)
def test_other_private_detail_formats_are_masked(client, monkeypatch, detail):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    seen = []

    def fake_post(url, **kwargs):
        seen.append(kwargs["json"]["messages"][1]["content"])
        return httpx.Response(200, json={"success": True, "result": {"response": '{"on_topic": false, "reply": ""}'}})

    monkeypatch.setattr(httpx, "post", fake_post)
    chat(client, f"May baha, tawagan si {detail}")
    assert seen == ["May baha, tawagan si [removed]"]


def test_ordinary_numbers_still_reach_the_model(client, monkeypatch):
    register(client)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    seen = []

    def fake_post(url, **kwargs):
        seen.append(kwargs["json"]["messages"][1]["content"])
        return httpx.Response(200, json={"success": True, "result": {"response": '{"on_topic": false, "reply": ""}'}})

    monkeypatch.setattr(httpx, "post", fake_post)
    chat(client, "1+1")
    chat(client, "May baha sa Blk 12 Lot 34 Phase 5")
    assert seen == ["1+1", "May baha sa Blk 12 Lot 34 Phase 5"]


def test_off_topic_verdict_shows_only_the_fixed_reply(client, monkeypatch):
    register(client)
    kap_says(monkeypatch, "1+1 is 2", on_topic=False)
    data = chat(client, "1+1").json()
    assert data["source"] == "out_of_scope"
    assert data["llm_available"] is False
    assert "Kap" in data["reply"]
    assert "2" not in data["reply"]


@pytest.mark.parametrize("language", ["fil", "taglish"])
def test_off_topic_reply_follows_the_language(client, monkeypatch, language):
    register(client)
    kap_says(monkeypatch, "", on_topic=False)
    assert "Ako si Kap" in chat(client, "1+1", language).json()["reply"]


def test_kap_reply_is_plain_text_without_a_cut_off_sentence(client, monkeypatch):
    register(client)
    kap_says(monkeypatch, "## Baha\n**Lumayo** sa baha. Mag-ulat sa barangay. Huwag tumawid sa")
    assert chat(client, "May baha", "fil").json()["reply"] == "Baha\nLumayo sa baha. Mag-ulat sa barangay."


@pytest.mark.parametrize(
    ("answer", "reply"),
    [
        ('Lumayo sa baha. Mag-ulat "agad."', 'Lumayo sa baha. Mag-ulat "agad."'),
        ("Lumayo sa baha (kung ligtas.)", "Lumayo sa baha (kung ligtas.)"),
        ("Tumawag sa Brgy. San Jose para mag-ulat. Huwag tumawid", "Tumawag sa Brgy. San Jose para mag-ulat."),
        ("1. Lumayo sa baha.\n- *Mag-ulat* sa barangay.", "Lumayo sa baha.\nMag-ulat sa barangay."),
    ],
)
def test_kap_reply_keeps_whole_sentences(client, monkeypatch, answer, reply):
    register(client)
    kap_says(monkeypatch, answer)
    assert chat(client, "May baha", "fil").json()["reply"] == reply


@pytest.mark.parametrize(
    "answer",
    [
        "1. Lumayo sa baha at mag-ulat",
        "Tumawag sa Brgy. San Jose at mag-ulat",
        "Flood. Call 0917 123 4567",
        "Flood safety first. Call **0917 123 4567** now",
        "Email brgy@example.test for help.",
        "Call 0917.123.4567 now.",
        "See example.gov.ph for help.",
        "Your report is currently resolved, so all is well.",
    ],
)
def test_kap_fragment_or_contact_details_fall_back(client, monkeypatch, answer):
    register(client)
    kap_says(monkeypatch, answer)
    assert chat(client, "May baha", "fil").json()["source"] == "deterministic"


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


@pytest.mark.parametrize(
    "provider_result",
    [
        httpx.Response(200, json=[]),
        httpx.Response(200, json={"success": True, "result": {"response": "https://invented.example/contact"}}),
        httpx.Response(200, json={"success": True, "result": {"response": "not json"}}),
        httpx.Response(200, json={"choices": ["x"]}),
        httpx.Response(200, json={"choices": [{"message": "x"}]}),
        httpx.Response(200, json={"success": True, "result": {"response": '{"reply": "no verdict"}'}}),
        httpx.Response(
            200,
            json={"success": True, "result": {"response": '{"on_topic": true, "reply": "See https://invented.example/contact."}'}},
        ),
    ],
)
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


@pytest.mark.parametrize(
    "status,translated",
    [
        ("Pending", "Naghihintay"),
        ("Under Verification", "Sinusuri"),
        ("Accepted", "Tinanggap"),
        ("In Progress", "Isinasagawa"),
        ("Resolved", "Nalutas"),
        ("Rejected", "Tinanggihan"),
    ],
)
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
