import atexit
import io
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Tests that build the app without the client fixture must never reach the real database or photos.
_isolated = tempfile.mkdtemp(prefix="barangai-tests-")
atexit.register(shutil.rmtree, _isolated, ignore_errors=True)
os.environ.update(DATABASE_URL=f"sqlite:///{Path(_isolated, 'default.db').as_posix()}",
                  PRIVATE_MEDIA_DIR=str(Path(_isolated, "private")), FACE_BLUR="off", PLATE_BLUR="off")


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    monkeypatch.setenv("PRIVATE_MEDIA_DIR", str(tmp_path / "private"))
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("CLOUDFLARE_WORKERS_AI_TOKEN", raising=False)
    for name in ("MODEL_CHECKPOINT", "MODEL_APPROVED_SHA256", "MODEL_CONFIDENCE_THRESHOLD",
                 "VALIDATED_EMBEDDING_MODEL_VERSION", "CHECKER_MODEL_DIR", "CLOUDFLARE_VISION_MODEL", "GEOCODER"):
        monkeypatch.delenv(name, raising=False)
    for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "TRUSTED_PROXY_HOPS",
                 "MAX_REPORTS_PER_DAY", "MAX_ADDENDA_PER_DAY", "MAX_IMAGE_EDGE"):
        monkeypatch.delenv(name, raising=False)
    # Face blurring needs OpenCV, which local test setups may lack; tests that cover it turn it on themselves.
    monkeypatch.setenv("FACE_BLUR", "off")
    monkeypatch.setenv("PLATE_BLUR", "off")
    from barangai import ai, brief, geo, media, privacy
    from barangai.main import create_app

    ai.clear_cache()
    geo.clear_cache()
    brief.clear_cache()
    media.clear_sanitized_cache()
    privacy.detector.cache_clear()
    privacy.plate_detector.cache_clear()

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def photo():
    output = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(output, format="JPEG", exif=b"Exif\x00\x00private-gps")
    return output.getvalue()


def register(client, email="resident@example.test", password="correct horse battery staple"):
    return client.post("/auth/register", json={"email": email, "password": password, "accepted_terms": True})
