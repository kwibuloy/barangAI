import io
import json
from pathlib import Path

import pytest
from barangai import ai, checker, vision
from conftest import register
from PIL import Image
from test_reports import submit

CHECKER_DIR = Path(__file__).resolve().parents[1] / "models" / "mobileclip2-s0"


def without_image(answer):
    return {key: value for key, value in answer.items() if key != "preview_image"}


def preview(client, photo, **data):
    return client.post(
        "/reports/predict",
        files={"image": ("incident.jpg", photo, "image/jpeg")},
        data=data,
        headers={"X-CSRF-Token": client.cookies["csrf_token"]},
    )


def fake_models(monkeypatch, seen=None, checked=None, calls=None):
    def describe(image, language="en", model=None):
        if calls is not None:
            calls.append(("vision", language))
        return seen

    def check(image):
        if calls is not None:
            calls.append(("checker", None))
        return checked

    monkeypatch.setattr(vision, "describe", describe)
    monkeypatch.setattr(checker, "check", check)


def test_preview_requires_auth_and_works_with_no_ai_configured(client, photo):
    files = {"image": ("incident.jpg", photo, "image/jpeg")}
    assert client.post("/reports/predict", files=files).status_code == 401
    register(client)
    assert without_image(preview(client, photo).json()) == {
        "prediction_available": False,
        "model_category": None,
        "confidence": None,
        "category_source": None,
        "needs_check": False,
        "problem_seen": True,
        "suggested_description": None,
        "hazards": [],
    }


def test_agreeing_models_fill_the_form_and_submission_reuses_the_preview(client, photo, monkeypatch):
    calls = []
    fake_models(
        monkeypatch,
        vision.VisionResult("flooding", "Knee-deep water covers the road.", ("blocks_road",), "vlm"),
        checker.CheckerResult("flooding", 0.82, [0.6, 0.8], "clip-v1"),
        calls,
    )
    register(client)
    body = preview(client, photo, language="fil").json()
    assert without_image(body) == {
        "prediction_available": True,
        "model_category": "flooding",
        "confidence": 0.82,
        "category_source": "agreed",
        "needs_check": False,
        "problem_seen": True,
        "suggested_description": "Knee-deep water covers the road.",
        "hazards": ["blocks_road"],
    }
    assert ("vision", "fil") in calls
    calls.clear()
    saved = submit(client, photo, resident_category="potholes").json()
    assert calls == []  # the preview's analysis is reused: no second Cloudflare call
    assert saved["resident_category"] == "potholes"  # the resident's choice always wins
    assert saved["model_category"] == "flooding"
    assert saved["verified_category"] is None
    assert saved["hazards"] == ["blocks_road"]
    assert saved["prediction_available"] is True


def test_disagreement_asks_the_resident_to_check(client, photo, monkeypatch):
    fake_models(
        monkeypatch,
        vision.VisionResult("potholes", "A deep hole in the road.", (), "vlm"),
        checker.CheckerResult("flooding", 0.7, [1.0], "clip-v1"),
    )
    register(client)
    body = preview(client, photo).json()
    assert body["model_category"] == "potholes"
    assert body["category_source"] == "vision"
    assert body["needs_check"] is True


def test_checker_stands_in_when_the_vision_model_is_unavailable(client, photo, monkeypatch):
    fake_models(monkeypatch, None, checker.CheckerResult("fallen_trees", 0.66, [1.0], "clip-v1"))
    register(client)
    body = preview(client, photo).json()
    assert body["model_category"] == "fallen_trees"
    assert body["category_source"] == "checker"
    assert body["suggested_description"] is None


def test_submission_without_preview_runs_only_the_local_checker(client, photo, monkeypatch):
    calls = []
    fake_models(
        monkeypatch,
        vision.VisionResult("flooding", "Water.", (), "vlm"),
        checker.CheckerResult("potholes", 0.9, [0.1, 0.2], "clip-v1"),
        calls,
    )
    register(client)
    saved = submit(client, photo, resident_category="potholes").json()
    assert calls == [("checker", None)]
    assert saved["model_category"] == "potholes"
    assert saved["hazards"] == []
    from barangai.db import session_for_url
    from barangai.models import Report

    with session_for_url() as db:
        report = db.get(Report, saved["id"])
        assert report.image_embedding == [0.1, 0.2]
        assert report.embedding_model_version == "clip-v1"


def test_street_name_comes_from_the_server_not_the_client(client, photo, monkeypatch):
    import httpx
    from barangai import geo

    monkeypatch.setenv("GEOCODER", "nominatim")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json={"address": {"road": "Mabini Street"}}))
    geo.clear_cache()
    register(client)
    saved = client.post(
        "/reports",
        files={"image": ("incident.jpg", photo, "image/jpeg")},
        data={
            "latitude": "14.3",
            "longitude": "120.9",
            "resident_category": "potholes",
            "location_label": "Somewhere else entirely",
        },
        headers={"X-CSRF-Token": client.cookies["csrf_token"]},
    ).json()
    assert saved["location_label"] == "Mabini Street"


def test_no_street_name_without_a_geocoder(client, photo):
    register(client)
    assert submit(client, photo).json()["location_label"] is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (
            'Sure! {"category": "Exposed_Wiring", "description": "A wire hangs low.", "hazards": ["electrical_hazard", "x"]}',
            ("exposed_wiring", "A wire hangs low.", ("electrical_hazard",)),
        ),
        ('{"category": "volcano", "description": "Smoke rises.", "hazards": []}', (None, "Smoke rises.", ())),
        (
            '{"category": "potholes", "description": "Call 0917 123 4567 for help", "hazards": []}',
            ("potholes", None, ()),
        ),
        ('{"category": "none", "description": ""}', (None, vision.UNCERTAIN["en"], ())),
        ("not json at all", None),
    ],
)
def test_vision_replies_are_validated(text, expected):
    result = vision.parse(text, "vlm")
    assert (result and (result.category, result.description, result.hazards)) == expected


def test_vision_prompt_asks_for_rough_scale_not_measurements():
    prompt = vision.instructions("en")
    assert "knee-deep" in prompt and "about" in prompt
    assert "Never give measurements in centimetres or metres" in prompt


def test_vision_request_shapes(monkeypatch):
    path, body = vision.request_body("@cf/mistralai/mistral-small-3.1-24b-instruct", b"img", "fil")
    assert path == "ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct"
    assert body["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert "Filipino" in body["messages"][0]["content"][0]["text"]
    path, body = vision.request_body("@cf/meta/llama-3.2-11b-vision-instruct", b"img", "en")
    assert path.startswith("ai/run/") and body["image"]


def test_vision_failures_return_nothing(monkeypatch):
    import httpx

    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(429, json={"errors": ["quota"]}))
    assert vision.describe(_jpeg()) is None  # quota spent

    def boom(*a, **k):
        raise httpx.ConnectTimeout("slow")

    monkeypatch.setattr(httpx, "post", boom)
    assert vision.describe(_jpeg()) is None


def test_vision_reads_openai_style_replies(monkeypatch):
    import httpx

    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    reply = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "category": "uncollected_garbage",
                            "description": "Bags of trash on the corner.",
                            "hazards": [],
                        }
                    )
                }
            }
        ]
    }
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(200, json=reply))
    result = vision.describe(_jpeg(2000, 1500))
    assert result.category == "uncollected_garbage"


def test_shrink_limits_the_longest_side():
    small = vision.shrink(_jpeg(2000, 1500))
    with Image.open(io.BytesIO(small)) as image:
        assert max(image.size) == 1024


def _jpeg(width=64, height=48):
    output = io.BytesIO()
    Image.new("RGB", (width, height), "gray").save(output, format="JPEG")
    return output.getvalue()


@pytest.mark.skipif(not (CHECKER_DIR / "visual.onnx").is_file(), reason="Checker model not exported")
def test_real_checker_model_loads_and_embeds(monkeypatch):
    pytest.importorskip("onnxruntime")
    monkeypatch.setenv("CHECKER_MODEL_DIR", str(CHECKER_DIR))
    checker.validate_configured_checker()
    result = checker.check(_jpeg(640, 480))
    meta = json.loads((CHECKER_DIR / "checker.json").read_text(encoding="utf-8"))
    assert result.model_version == meta["version"]
    assert len(result.embedding) == 512
    assert abs(sum(v * v for v in result.embedding) - 1) < 1e-3
    assert 0 < result.confidence <= 1
    # A flat grey photo is no barangay concern: the checker abstains.
    assert result.category is None


def test_checker_rejects_a_tampered_model(tmp_path, monkeypatch):
    (tmp_path / "visual.onnx").write_bytes(b"tampered")
    (tmp_path / "checker.json").write_text(json.dumps({"onnx_sha256": "0" * 64, "classes": []}), encoding="utf-8")
    monkeypatch.setenv("CHECKER_MODEL_DIR", str(tmp_path))
    checker.load_runtime.cache_clear()
    with pytest.raises(ValueError, match="SHA-256"):
        checker.validate_configured_checker()
    checker.load_runtime.cache_clear()


def test_combine_rules():
    seen = vision.VisionResult(None, "Something odd.", (), "vlm")
    assert ai.combine(seen, None).source is None
    assert ai.combine(seen, None).description == "Something odd."
    assert ai.combine(None, None).available is False


def test_vision_reads_already_parsed_json_replies(monkeypatch):
    """Mistral on Workers AI returns the JSON object itself, not text."""
    import httpx

    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    reply = {
        "success": True,
        "errors": [],
        "result": {
            "response": {
                "category": "potholes",
                "description": "A deep pothole in the road.",
                "hazards": ["blocks_road"],
            }
        },
    }
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(200, json=reply))
    result = vision.describe(_jpeg())
    assert (result.category, result.description, result.hazards) == (
        "potholes",
        "A deep pothole in the road.",
        ("blocks_road",),
    )


def test_cloudflare_errors_are_logged_without_secrets(monkeypatch, caplog):
    import httpx

    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-secret-token")
    denied = {"success": False, "errors": [{"code": 5018, "message": "This account is not allowed to access model"}]}
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(403, json=denied))
    assert vision.describe(_jpeg()) is None
    assert "not allowed to access model" in caplog.text
    assert "synthetic-secret-token" not in caplog.text


def test_nothing_broken_keeps_the_guess_but_asks_the_resident_to_verify(client, photo, monkeypatch):
    seen = vision.parse(
        json.dumps(
            {
                "category": "damaged_signage",
                "problem_visible": False,
                "description": "A clean, readable street sign.",
                "hazards": ["blocks_road"],
            }
        ),
        "vlm",
        "en",
    )
    assert seen.category == "damaged_signage" and seen.problem_seen is False
    assert seen.description == f"{vision.UNCERTAIN['en']} A clean, readable street sign."
    assert seen.hazards == ()  # no hazards from a photo where nothing looks wrong
    fake_models(monkeypatch, seen, checker.CheckerResult(None, 0.7, [1.0], "clip-v1"))
    register(client)
    body = preview(client, photo).json()
    assert body["model_category"] == "damaged_signage"
    assert body["needs_check"] is True
    assert body["problem_seen"] is False
    assert body["suggested_description"].startswith("The AI is uncertain")


def test_uncertain_note_follows_the_language():
    seen = vision.parse(
        '{"category": "potholes", "problem_visible": false, "description": "Maayos ang kalsada."}', "vlm", "fil"
    )
    assert seen.description.startswith("Hindi tiyak ang AI")


def test_streetlights_are_always_confirmed_by_the_resident():
    seen = vision.VisionResult("broken_streetlights", "A lamp post.", (), "vlm")
    checked = checker.CheckerResult("broken_streetlights", 0.9, [1.0], "clip-v1")
    result = ai.combine(seen, checked)
    assert result.source == "agreed"
    assert result.needs_check is True


def test_checker_only_guesses_are_marked_to_check():
    result = ai.combine(None, checker.CheckerResult("potholes", 0.9, [1.0], "clip-v1"))
    assert (result.category, result.source, result.needs_check) == ("potholes", "checker", True)


def test_a_crashing_model_never_blocks_the_form(client, photo, monkeypatch):
    def broken(*args, **kwargs):
        raise AttributeError("unexpected reply shape")

    fake_models(monkeypatch, checked=checker.CheckerResult("potholes", 0.7, [0.6, 0.8], "clip-v1"))
    monkeypatch.setattr(vision, "describe", broken)
    register(client)
    data = preview(client, photo).json()
    assert data["model_category"] == "potholes" and data["category_source"] == "checker"
    monkeypatch.setattr(checker, "check", broken)
    ai.clear_cache()
    assert submit(client, photo).status_code == 201
