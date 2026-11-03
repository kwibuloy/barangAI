from datetime import UTC, datetime
from pathlib import Path

from conftest import register


def submit(client, photo, **fields):
    data = {"latitude": "14.6000", "longitude": "121.0000", "resident_category": "flooding", **fields}
    return client.post("/reports", data=data, files={"image": ("incident.jpg", photo, "image/jpeg")},
                       headers={"X-CSRF-Token": client.cookies.get("csrf_token", "")})


def test_submission_records_pending_and_manual_fallback(client, photo):
    register(client)
    response = submit(client, photo, description="Synthetic flooded lane")
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["status"] == "Pending"
    assert report["prediction_available"] is False
    assert report["model_category"] is None
    assert report["resident_category"] == "flooding"
    assert report["verified_category"] is None
    assert report["events"][0]["to_status"] == "Pending"
    assert datetime.fromisoformat(report["created_at"]).utcoffset() == UTC.utcoffset(None)
    assert datetime.fromisoformat(report["events"][0]["created_at"]).utcoffset() == UTC.utcoffset(None)
    assert len(client.get("/reports").json()) == 1
    assert client.get(f'/reports/{report["id"]}/image').status_code == 200


def test_resident_cannot_read_other_residents_report_or_image(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    client.cookies.clear()
    register(client, "other@example.test")
    assert client.get(f"/reports/{report_id}").status_code == 404
    assert client.get(f"/reports/{report_id}/image").status_code == 404
    assert client.get("/reports").json() == []


def test_invalid_or_large_image_leaves_no_report_or_media(client, tmp_path, photo, monkeypatch):
    register(client)
    assert submit(client, b"not an image").status_code == 422
    monkeypatch.setenv("MAX_IMAGE_BYTES", "10")
    assert submit(client, photo).status_code == 413
    assert client.get("/reports").json() == []
    assert list(Path(__import__("os").environ["PRIVATE_MEDIA_DIR"]).glob("*")) == []


def test_image_metadata_is_removed(client, photo):
    register(client)
    report_id = submit(client, photo).json()["id"]
    result = client.get(f"/reports/{report_id}/image")
    assert b"private-gps" not in result.content
    assert result.headers["content-type"] == "image/jpeg"


def test_camera_photo_rotation_is_applied_before_stripping_metadata(client):
    import io

    from PIL import Image
    output = io.BytesIO()
    orientation = Image.Exif()
    orientation[274] = 6
    Image.new("RGB", (8, 16), "red").save(output, format="JPEG", exif=orientation)
    register(client)
    report_id = submit(client, output.getvalue()).json()["id"]
    result = client.get(f"/reports/{report_id}/image")
    with Image.open(io.BytesIO(result.content)) as image:
        assert image.size == (16, 8)
        assert not image.getexif()


def test_location_and_category_are_validated(client, photo):
    register(client)
    assert submit(client, photo, latitude="91").status_code == 422
    assert submit(client, photo, resident_category="unknown").status_code == 422
    assert client.get("/reports").json() == []


def test_oversized_unauthenticated_multipart_is_rejected_before_parsing(client, monkeypatch):
    monkeypatch.setenv("MAX_REQUEST_BYTES", "100")
    response = client.post("/reports", files={"image": ("large.jpg", b"x" * 200, "image/jpeg")})
    assert response.status_code == 413
    preview = client.post("/reports/predict", files={"image": ("large.jpg", b"x" * 200, "image/jpeg")})
    assert preview.status_code == 413


def test_paper_categories_and_other_are_accepted_but_unknown_is_refused(client, photo):
    register(client)
    for category in ("broken_streetlights", "exposed_wiring", "other"):
        response = submit(client, photo, resident_category=category)
        assert response.status_code == 201, response.text
        assert response.json()["resident_category"] == category
    assert submit(client, photo, resident_category="earthquake").status_code == 422


def test_descriptions_are_trimmed_and_capped(client, photo):
    register(client)
    assert submit(client, photo, description="  Synthetic blocked drain  ").json()["description"] == "Synthetic blocked drain"
    assert submit(client, photo, description="   ").json()["description"] is None
    assert submit(client, photo, description="x" * 1001).status_code == 422


def test_large_photo_is_shrunk_before_storage(client):
    import io

    from PIL import Image
    output = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6  # rotated camera photo
    exif.get_ifd(0x8825)[2] = (14.0, 18.0, 0.0)  # synthetic GPS latitude
    Image.radial_gradient("L").resize((4000, 3000)).convert("RGB").save(
        output, format="JPEG", quality=95, exif=exif, comment=b"Synthetic Juan, 14.3N 120.9E"
    )
    assert len(output.getvalue()) < 5_000_000
    register(client)
    report_id = submit(client, output.getvalue()).json()["id"]
    result = client.get(f"/reports/{report_id}/image")
    with Image.open(io.BytesIO(result.content)) as image:
        assert image.size == (1200, 1600)
        assert image.format == "JPEG"
        assert not image.getexif()
        assert "comment" not in image.info and "icc_profile" not in image.info
    assert b"Synthetic" not in result.content
    assert len(result.content) < len(output.getvalue())


def test_transparent_png_is_flattened_on_white(client):
    import io

    from PIL import Image
    output = io.BytesIO()
    Image.new("RGBA", (8, 8), (0, 0, 0, 0)).save(output, format="PNG")
    register(client)
    report_id = submit(client, output.getvalue()).json()["id"]
    with Image.open(io.BytesIO(client.get(f"/reports/{report_id}/image").content)) as image:
        assert min(image.getpixel((4, 4))) > 240
