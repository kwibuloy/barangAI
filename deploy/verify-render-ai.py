"""Offline check of the built image; run with Docker memory and CPU limits."""

import io
import json
import os
import resource
import tempfile
import time
from pathlib import Path

from PIL import Image

started = time.monotonic()
with tempfile.TemporaryDirectory() as directory:
    os.environ.update(DATABASE_URL=f"sqlite:///{directory}/test.db",
                      PRIVATE_MEDIA_DIR=f"{directory}/private", MEDIA_STORAGE="local",
                      COOKIE_SECURE="false")
    from fastapi.testclient import TestClient
    from barangai.main import app

    loaded = time.monotonic() - started
    print("Model and website loaded", flush=True)
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/api/health").json() == {"status": "ok"}
        assert client.get("/models/mobileclip2-s0/visual.onnx").status_code == 404
        image = io.BytesIO()
        metadata = Image.Exif()
        metadata[270] = "Synthetic private image description"
        Image.new("RGB", (1024, 768), "red").save(image, "JPEG", exif=metadata)
        photo = image.getvalue()
        with Image.open(io.BytesIO(photo)) as original:
            assert original.getexif()[270] == metadata[270]
        files = {"image": ("synthetic.jpg", photo, "image/jpeg")}
        assert client.post("/api/reports/predict", files=files).status_code == 401
        response = client.post("/api/auth/register", json={
            "email": "container-resident@example.test", "password": "synthetic demo password"})
        assert response.status_code == 201, response.text
        headers = {"X-CSRF-Token": client.cookies["csrf_token"]}
        timings = []
        for _ in range(5):
            before = time.monotonic()
            preview = client.post("/api/reports/predict", files=files, headers=headers)
            assert preview.status_code == 200, preview.text
            prediction = preview.json()
            assert prediction["prediction_available"] is True, prediction
            assert 0 <= prediction["confidence"] <= 1
            timings.append(time.monotonic() - before)
        # Exercise a phone-sized photo and the API's accepted 20-megapixel limit.
        print("Normal-photo predictions passed", flush=True)
        large_timings = []
        for size in ((4000, 3000), (5000, 4000)):
            print(f"Checking {size[0]}x{size[1]} photo", flush=True)
            large = io.BytesIO()
            Image.new("RGB", size, "red").save(large, "JPEG")
            before = time.monotonic()
            response = client.post("/api/reports/predict", headers=headers,
                files={"image": ("synthetic-large.jpg", large.getvalue(), "image/jpeg")})
            assert response.status_code == 200, response.text
            assert response.json()["prediction_available"] is True, response.text
            large_timings.append({"size": size, "seconds": round(time.monotonic() - before, 3)})
        saved = client.post("/api/reports", files=files, headers=headers, data={
            "latitude": "14.6000", "longitude": "121.0000", "resident_category": "fallen_trees"})
        assert saved.status_code == 201, saved.text
        report = saved.json()
        assert report["prediction_available"] is True
        assert report["resident_category"] == "fallen_trees"
        assert report["verified_category"] is None
        assert report["model_category"] == prediction["model_category"]
        private_image = client.get(report["image_url"])
        assert private_image.status_code == 200
        with Image.open(io.BytesIO(private_image.content)) as stored:
            assert not stored.getexif()
            assert "exif" not in stored.info
        client.cookies.clear()
        assert client.get(report["image_url"]).status_code == 401
    print(json.dumps({"startup_seconds": round(loaded, 3),
        "preview_seconds": [round(t, 3) for t in timings],
        "large_photos": large_timings,
        "process_peak_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        "container_peak_mib": round(int(Path("/sys/fs/cgroup/memory.peak").read_text()) / 1024**2, 1),
        "prediction": prediction, "checks": "passed"}, indent=2))
