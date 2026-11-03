"""Spam limits, trust checks, photo shrinking and face blurring, added details, the "already reported" check,
saved preferences, staff notifications and Kap's daily brief. Synthetic people and places only."""

import io
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from conftest import register
from PIL import Image, ImageDraw, ImageFilter
from test_cases import headers, login, resident_report, walk
from test_reports import submit
from test_workflow import staff_login


def exif_photo(latitude=None, longitude=None, taken=None, camera=None, size=(8, 8)):
    exif = Image.Exif()
    if camera:
        exif[271] = camera
    if taken:
        exif[0x8769] = {36867: taken}
    if latitude is not None:
        exif[0x8825] = {1: "N", 2: (float(latitude), 0.0, 0.0), 3: "E", 4: (float(longitude), 0.0, 0.0)}
    output = io.BytesIO()
    Image.new("RGB", size, "red").save(output, format="JPEG", exif=exif)
    return output.getvalue()


def manila_exif_time(days_ago):
    return (datetime.now(UTC) + timedelta(hours=8) - timedelta(days=days_ago)).strftime("%Y:%m:%d %H:%M:%S")


def staff_view(client, report_id):
    staff_login(client)
    return client.get(f"/reports/{report_id}").json()


# Spam limits


def test_upload_limit_is_per_resident_not_per_shared_address(client, photo):
    register(client, "ana@example.test")
    for _ in range(10):
        assert submit(client, photo).status_code == 201
    assert submit(client, photo).status_code == 429
    # Same test client address, different resident: not blocked by Ana's uploads.
    client.cookies.clear()
    register(client, "ben@example.test")
    assert submit(client, photo).status_code == 201


def test_daily_report_cap_is_counted_in_the_database(client, photo, monkeypatch):
    monkeypatch.setenv("MAX_REPORTS_PER_DAY", "2")
    register(client)
    assert submit(client, photo).status_code == 201
    assert submit(client, photo).status_code == 201
    blocked = submit(client, photo)
    assert blocked.status_code == 429 and blocked.json()["detail"] == "Daily report limit reached"
    # A restart clears in-memory limits, not this one.
    from barangai.auth import attempts

    attempts.clear()
    assert submit(client, photo).status_code == 429


def test_login_limit_is_per_account(client):
    register(client, "ana@example.test")
    client.cookies.clear()
    for _ in range(10):
        assert client.post("/auth/login", json={"email": "ana@example.test", "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"email": "ana@example.test", "password": "wrong"}).status_code == 429
    register(client, "ben@example.test")
    client.cookies.clear()
    assert (
        client.post(
            "/auth/login", json={"email": "ben@example.test", "password": "correct horse battery staple"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "hops,forwarded,expected",
    [
        ("0", "203.0.113.9", "testclient"),
        ("1", "198.51.100.7", "198.51.100.7"),
        # A client-written entry on the left is ignored; the one the trusted proxy appended is used.
        ("1", "6.6.6.6, 198.51.100.7", "198.51.100.7"),
        ("2", "198.51.100.7, 10.0.0.2", "198.51.100.7"),
        ("2", "198.51.100.7", "testclient"),
    ],
)
def test_client_address_trusts_only_configured_proxy_hops(monkeypatch, hops, forwarded, expected):
    from barangai.auth import client_ip
    from starlette.requests import Request

    monkeypatch.setenv("TRUSTED_PROXY_HOPS", hops)
    request = Request(
        {"type": "http", "headers": [(b"x-forwarded-for", forwarded.encode())], "client": ("testclient", 50000)}
    )
    assert client_ip(request) == expected


def test_password_guessing_from_elsewhere_does_not_lock_the_owner_out(client, monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    register(client, "ana@example.test")
    client.cookies.clear()
    stranger = {"X-Forwarded-For": "198.51.100.66"}
    for _ in range(10):
        assert (
            client.post(
                "/auth/login", json={"email": "ana@example.test", "password": "wrong"}, headers=stranger
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/auth/login", json={"email": "ana@example.test", "password": "wrong"}, headers=stranger
        ).status_code
        == 429
    )
    assert (
        client.post(
            "/auth/login",
            json={"email": "ana@example.test", "password": "correct horse battery staple"},
            headers={"X-Forwarded-For": "203.0.113.5"},
        ).status_code
        == 200
    )


# Trust checks


def test_pin_far_from_photo_gps_and_old_photo_are_flagged_for_staff_only(client):
    register(client)
    photo = exif_photo(latitude=14, longitude=121, taken=manila_exif_time(30), camera="SyntheticCam")
    report = submit(client, photo, latitude="14.6000", longitude="121.0000", location_source="manual").json()
    assert "trust_flags" not in report
    assert "trust_flags" not in client.get(f"/reports/{report['id']}").json()
    assert all("trust_flags" not in item for item in client.get("/reports").json())
    seen = staff_view(client, report["id"])
    codes = {flag["code"]: flag["detail"] for flag in seen["trust_flags"]}
    assert codes["pin_far_from_photo"] > 60_000  # 0.6 degrees of latitude
    assert codes["old_photo"] >= 29
    assert seen["location_source"] == "manual"
    assert client.get("/reports").json()[0]["trust_flags"] == seen["trust_flags"]


def test_matching_recent_camera_photo_has_no_flags(client):
    register(client)
    photo = exif_photo(latitude=14, longitude=121, taken=manila_exif_time(0), camera="SyntheticCam")
    report_id = submit(client, photo, latitude="14.0005", longitude="121.0000", location_source="photo").json()["id"]
    assert staff_view(client, report_id)["trust_flags"] == []


def test_browser_reading_is_used_when_shrinking_removed_the_details(client, photo):
    register(client)
    report_id = submit(
        client,
        photo,
        latitude="14.6000",
        longitude="121.0000",
        photo_latitude="14.0",
        photo_longitude="121.0",
        photo_taken_at=manila_exif_time(1),
        photo_camera="1",
    ).json()["id"]
    assert [flag["code"] for flag in staff_view(client, report_id)["trust_flags"]] == ["pin_far_from_photo"]


def test_photo_without_any_details_is_flagged_and_unknown_sources_are_dropped(client, photo):
    register(client)
    report_id = submit(client, photo, location_source="satellite").json()["id"]
    seen = staff_view(client, report_id)
    assert [flag["code"] for flag in seen["trust_flags"]] == ["no_photo_details"]
    assert seen["location_source"] is None


def test_trust_flag_thresholds():
    from barangai import trust

    today = datetime(2026, 11, 3, tzinfo=UTC)
    facts = {"latitude": 14.6, "longitude": 121.0, "taken_at": today + timedelta(days=3), "camera": True}
    assert trust.flags(facts, 14.6, 121.0, today) == [{"code": "photo_date_ahead", "detail": 3}]
    assert trust.flags({**facts, "taken_at": today}, 14.6012, 121.0, today) == []  # about 133 m
    assert trust.flags({**facts, "taken_at": today}, 14.6018, 121.0, today)[0]["code"] == "pin_far_from_photo"
    assert trust.client_facts("not a date", "0", "abc", "1") == {}


# Shrinking and face blurring


def test_jpeg_comments_and_other_carried_over_details_are_removed(client):
    output = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(
        output, format="JPEG", comment=b"Synthetic owner note 14.33,120.93", dpi=(300, 300)
    )
    register(client)
    report_id = submit(client, output.getvalue()).json()["id"]
    stored = client.get(f"/reports/{report_id}/image").content
    assert b"Synthetic owner note" not in stored
    with Image.open(io.BytesIO(stored)) as image:
        assert "comment" not in image.info and not image.getexif()


def test_broken_photo_details_never_fail_a_report(monkeypatch):
    from barangai import trust

    def broken(_data):
        raise KeyError("synthetic malformed IFD")

    monkeypatch.setattr(trust, "read_facts", broken)
    assert trust.photo_facts(b"anything") == {}


def test_large_photos_are_shrunk_to_the_long_edge_limit(client):
    register(client)
    big = exif_photo(size=(4000, 3000))
    report_id = submit(client, big).json()["id"]
    with Image.open(io.BytesIO(client.get(f"/reports/{report_id}/image").content)) as image:
        assert image.size == (1600, 1200)
        assert not image.getexif()


def test_detected_faces_are_blurred_before_storage(monkeypatch):
    from barangai import media, privacy

    image = Image.new("RGB", (200, 200), "white")
    for x in range(60, 140, 4):
        for y in range(60, 140):
            image.putpixel((x, y), (0, 0, 0))  # sharp synthetic stripes standing in for a face
    output = io.BytesIO()
    image.save(output, format="PNG")
    monkeypatch.setattr(privacy, "find_faces", lambda _image: [(70, 70, 60, 60)])
    media.clear_sanitized_cache()
    with Image.open(io.BytesIO(media.sanitize_image(output.getvalue()))) as cleaned:
        inside = [cleaned.getpixel((x, 100))[0] for x in range(80, 120)]
        outside = cleaned.getpixel((5, 5))[0]
    assert max(inside) - min(inside) < 60  # stripes smeared into grey
    assert outside > 240  # the rest of the photo is untouched


def test_face_blur_failure_keeps_the_photo(monkeypatch):
    from barangai import privacy

    def broken(_image):
        raise RuntimeError("synthetic detector failure")

    monkeypatch.setattr(privacy, "find_faces", broken)
    image = Image.new("RGB", (10, 10), "white")
    assert privacy.blur_faces(image) == (image, 0)


def test_face_blur_is_off_without_opencv_or_when_disabled(monkeypatch):
    from barangai import privacy

    monkeypatch.setenv("FACE_BLUR", "off")
    privacy.detector.cache_clear()
    assert privacy.enabled() is False
    assert privacy.find_faces(Image.new("RGB", (10, 10))) == []
    privacy.detector.cache_clear()


def test_face_blur_is_off_when_the_model_file_is_missing(monkeypatch, tmp_path):
    pytest.importorskip("cv2")
    from barangai import media, privacy

    monkeypatch.setenv("FACE_BLUR", "on")
    monkeypatch.setenv("FACE_MODEL_PATH", str(tmp_path / "absent.onnx"))
    privacy.detector.cache_clear()
    try:
        assert privacy.enabled() is False
        media.clear_sanitized_cache()
        assert media.sanitize_image(jpeg(scene_with_face(120)))
    finally:
        privacy.detector.cache_clear()


# The real model on drawn pictures, so no photo of anyone is kept in the repository. Skipped without OpenCV.


@pytest.fixture
def real_detector(monkeypatch):
    pytest.importorskip("cv2")
    from barangai import media, privacy

    monkeypatch.setenv("FACE_BLUR", "on")
    monkeypatch.delenv("FACE_MODEL_PATH", raising=False)
    privacy.detector.cache_clear()
    media.clear_sanitized_cache()
    yield privacy
    privacy.detector.cache_clear()
    media.clear_sanitized_cache()


def drawn_face(size):
    """A synthetic head on grey: nobody's face, but enough like one for the detector."""
    s = size / 400
    picture = Image.new("RGB", (size, size), (205, 215, 225))
    draw = ImageDraw.Draw(picture)

    def at(*values):
        return [value * s for value in values]

    draw.ellipse(at(80, 30, 320, 300), fill=(40, 28, 22))
    draw.rounded_rectangle(at(170, 300, 230, 380), 20 * s, fill=(190, 140, 110))
    draw.ellipse(at(100, 70, 300, 340), fill=(214, 170, 140))
    for x in (155, 245):
        draw.arc(at(x - 32, 135, x + 32, 175), 200, 340, fill=(40, 28, 22), width=max(1, int(7 * s)))
        draw.ellipse(at(x - 26, 165, x + 26, 193), fill=(245, 240, 235))
        draw.ellipse(at(x - 12, 166, x + 12, 192), fill=(55, 35, 25))
    draw.polygon(at(200, 190, 182, 250, 218, 250), fill=(196, 148, 120))
    draw.ellipse(at(180, 244, 196, 256), fill=(120, 80, 65))
    draw.ellipse(at(204, 244, 220, 256), fill=(120, 80, 65))
    draw.chord(at(155, 265, 245, 310), 0, 180, fill=(150, 60, 60))
    return picture.filter(ImageFilter.GaussianBlur(max(0.5, 2.5 * s)))


def scene_with_face(size, turned=0, where=(300, 200)):
    scene = Image.new("RGB", (1000, 800), (150, 170, 190))
    face = drawn_face(size)
    if turned:
        face = face.rotate(turned, expand=True, fillcolor=(150, 170, 190))
    scene.paste(face, where)
    return scene


def wiring_scene():
    """Sky, poles, cross-arms and a tangle of overhead wires, with no one in it."""
    scene = Image.new("RGB", (1000, 800), (170, 200, 230))
    draw = ImageDraw.Draw(scene)
    for x in (150, 520, 880):
        draw.rectangle((x - 9, 60, x + 9, 800), fill=(90, 90, 85))
        for y in (110, 170):
            draw.rectangle((x - 80, y, x + 80, y + 10), fill=(60, 60, 60))
            for dx in (-70, -30, 30, 70):
                draw.rectangle((x + dx - 5, y - 18, x + dx + 5, y), fill=(225, 225, 215))
    for k in range(40):
        y = 90 + k * 9
        sag = 20 + (k * 37) % 90
        points = [(i, y + ((k * 13) % 50) + sag * (1 - ((i - 500) / 500) ** 2)) for i in range(0, 1001, 20)]
        draw.line(points, fill=(20, 20, 25), width=1 + k % 3)
    for x, y in ((300, 260), (640, 300), (420, 420)):
        draw.ellipse((x, y, x + 70, y + 90), outline=(15, 15, 15), width=3)
        draw.rectangle((x + 20, y + 25, x + 50, y + 60), fill=(50, 50, 55))
    return scene


def jpeg(picture, orientation=None):
    output = io.BytesIO()
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    picture.save(output, format="JPEG", quality=92, exif=exif)
    return output.getvalue()


def sharpness(picture, box):
    """How much neighbouring pixels differ inside the box: a blurred region scores near zero."""
    grey = picture.crop(box).convert("L")
    pixels = grey.tobytes()
    width = grey.width
    return sum(abs(pixels[i] - pixels[i + 1]) for i in range(len(pixels) - 1) if (i + 1) % width) / len(pixels)


@pytest.mark.parametrize("size", [400, 200, 120, 80, 50])
def test_real_detector_finds_faces_large_and_small(real_detector, size):
    boxes = real_detector.find_faces(scene_with_face(size))
    assert len(boxes) == 1
    left, top, width, height = boxes[0]
    assert 300 <= left + width / 2 <= 300 + size and 200 <= top + height / 2 <= 200 + size


@pytest.mark.parametrize("turned", [-30, -15, 15, 30, 90, -90])
def test_real_detector_finds_tilted_and_sideways_faces(real_detector, turned):
    boxes = real_detector.find_faces(scene_with_face(200, turned))
    assert len(boxes) == 1  # the upright and sideways passes do not count one face twice
    left, top, width, height = boxes[0]
    assert left <= 400 <= left + width and top <= 300 <= top + height  # the drawn head's centre, wherever it turned


class FakeModel:
    """Answers each detection pass from a list; an exception in the list makes that pass fail."""

    def __init__(self, *passes):
        self.passes = list(passes)

    def setInputSize(self, _size):
        pass

    def detect(self, _picture):
        answer = self.passes.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return 1, answer


def test_one_face_found_by_two_passes_is_blurred_to_the_outer_edge_of_both(monkeypatch):
    numpy = pytest.importorskip("numpy")
    from barangai import privacy

    upright = numpy.array([[480, 380, 40, 40]], dtype=float)
    # On the copy turned left (a 640 x 480 picture becomes 480 x 640), this maps back to 200-500 across, 260-560 down.
    turned = numpy.array([[260, 140, 300, 300]], dtype=float)
    monkeypatch.setattr(privacy, "detector", lambda: FakeModel(upright, turned, None))
    assert privacy.find_faces(Image.new("RGB", (640, 480))) == [(200, 260, 320, 300)]


def test_a_failed_pass_keeps_the_faces_the_other_passes_found(monkeypatch):
    numpy = pytest.importorskip("numpy")
    from barangai import privacy

    upright = numpy.array([[100, 100, 60, 60]], dtype=float)
    monkeypatch.setattr(privacy, "detector", lambda: FakeModel(upright, RuntimeError("synthetic"), RuntimeError("synthetic")))
    assert privacy.find_faces(Image.new("RGB", (640, 480))) == [(100, 100, 60, 60)]


def test_empty_and_non_finite_boxes_from_the_model_are_ignored(monkeypatch):
    numpy = pytest.importorskip("numpy")
    from barangai import privacy

    nonsense = numpy.array([[9e9, -9e9, 0, 0], [numpy.nan, 5, 10, 10], [5, 5, numpy.inf, 10]], dtype=float)
    monkeypatch.setattr(privacy, "detector", lambda: FakeModel(nonsense, None, None))
    assert privacy.find_faces(Image.new("RGB", (640, 480))) == []


def test_unreadable_face_model_turns_blurring_off_instead_of_failing(monkeypatch, tmp_path, real_detector):
    broken = tmp_path / "broken.onnx"
    broken.write_bytes(b"not a model")
    monkeypatch.setenv("FACE_MODEL_PATH", str(broken))
    real_detector.detector.cache_clear()
    assert real_detector.enabled() is False


def test_real_detector_leaves_wires_and_poles_sharp(real_detector):
    assert real_detector.find_faces(wiring_scene()) == []
    assert real_detector.blur_faces(wiring_scene())[1] == 0


def test_wiring_beside_a_face_stays_sharp_after_blurring(real_detector):
    from barangai import media

    scene = wiring_scene()
    scene.paste(drawn_face(160), (760, 600))
    wires = (40, 150, 500, 450)
    with Image.open(io.BytesIO(media.sanitize_image(jpeg(scene)))) as cleaned:
        assert sharpness(cleaned, wires) > 0.8 * sharpness(scene, wires)
        assert sharpness(cleaned, (790, 640, 890, 730)) < 0.5 * sharpness(scene, (790, 640, 890, 730))


@pytest.mark.parametrize(
    "orientation, to_stored",
    [
        (3, Image.Transpose.ROTATE_180),
        (6, Image.Transpose.ROTATE_90),
        (8, Image.Transpose.ROTATE_270),
    ],
)
def test_face_in_a_photo_with_exif_rotation_is_blurred_where_it_ends_up(real_detector, orientation, to_stored):
    from barangai import media

    upright = scene_with_face(200)
    face = (340, 240, 460, 360)
    with Image.open(io.BytesIO(media.sanitize_image(jpeg(upright.transpose(to_stored), orientation)))) as cleaned:
        assert cleaned.size == upright.size and not cleaned.getexif()
        assert sharpness(cleaned, face) < 0.5 * sharpness(upright, face)
        red, _, blue = cleaned.crop(face).resize((1, 1)).getpixel((0, 0))
        assert red > blue  # skin, not the blue-grey background: the photo was turned the right way


# Details added later, and staff notifications


def add(client, report_id, note="Synthetic: the water is knee-deep now", image=None):
    files = {"image": ("more.jpg", image, "image/jpeg")} if image else None
    return client.post(f"/reports/{report_id}/addenda", data={"note": note}, files=files, headers=headers(client))


def test_resident_adds_details_to_their_open_report_and_staff_are_notified(client, photo):
    staff_login(client)
    report_id = resident_report(client, photo, "ana@example.test")
    added = add(client, report_id, image=photo)
    assert added.status_code == 201, added.text
    detail = client.get(f"/reports/{report_id}").json()
    assert detail["addenda"][0]["note"] == "Synthetic: the water is knee-deep now"
    assert detail["description"] is None  # the original stays as it was
    image_url = detail["addenda"][0]["image_url"].removeprefix("/api")
    assert client.get(image_url).status_code == 200
    # Another resident sees nothing and cannot add.
    resident_report(client, photo, "ben@example.test")
    assert add(client, report_id).status_code == 404
    assert client.get(image_url).status_code == 404
    # Staff got one notice for the new report and one for the added details.
    login(client, "staff@example.test", "staff-password-123")
    kinds = sorted(item["kind"] for item in client.get("/notifications").json() if item["report_id"] == report_id)
    assert kinds == ["addendum", "new_report"]
    assert client.get(image_url).status_code == 200


def test_details_cannot_be_added_to_closed_reports_or_by_staff(client, photo):
    report_id = resident_report(client, photo, "ana@example.test")
    assert add(client, report_id, note="   ").status_code == 422
    import os

    os.environ["MAX_ADDENDA_PER_DAY"] = "1"
    try:
        assert add(client, report_id).status_code == 201
        capped = add(client, report_id)
        assert capped.status_code == 429 and capped.json()["detail"] == "Daily limit for added details reached"
    finally:
        del os.environ["MAX_ADDENDA_PER_DAY"]
    staff_login(client)
    assert add(client, report_id).status_code == 403
    walk(client, report_id, "Under Verification", "Rejected")
    login(client, "ana@example.test")
    assert add(client, report_id).status_code == 409


def test_resident_notifications_are_unchanged_by_staff_notices(client, photo):
    staff_login(client)
    report_id = resident_report(client, photo, "ana@example.test")
    assert client.get("/notifications").json() == []
    login(client, "staff@example.test", "staff-password-123")
    walk(client, report_id, "Under Verification")
    login(client, "ana@example.test")
    assert [(item["kind"], item["status"]) for item in client.get("/notifications").json()] == [
        ("status", "Under Verification")
    ]


# "You already reported this"


def nearby(client, category="flooding", latitude="14.6000", longitude="121.0000"):
    return client.get("/nearby", params={"category": category, "latitude": latitude, "longitude": longitude})


def test_nearby_finds_own_open_report_but_never_other_residents_private_reports(client, photo):
    mine = resident_report(client, photo, "ana@example.test")
    result = nearby(client).json()
    assert [item["id"] for item in result["own"]] == [mine] and result["own"][0]["distance_m"] == 0
    # Related category (garbage clogging the drain) still counts; an unrelated one or a far pin does not.
    assert nearby(client, category="uncollected_garbage").json()["own"]
    assert nearby(client, category="potholes").json()["own"] == []
    assert nearby(client, latitude="14.6100").json()["own"] == []
    # Ben's pending report at the same spot is private: Ana's check never reveals it.
    bens = resident_report(client, photo, "ben@example.test")
    assert [item["id"] for item in nearby(client).json()["own"]] == [bens]
    login(client, "ana@example.test")
    assert [item["id"] for item in nearby(client).json()["own"]] == [mine]
    assert nearby(client).json()["cases"] == []


def test_nearby_offers_neighbours_accepted_case_and_skips_closed_reports(client, photo):
    first = resident_report(client, photo, "ana@example.test")
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted")
    resident_report(client, photo, "ben@example.test", latitude="14.6150")  # far away, own report
    result = nearby(client).json()
    assert result["own"] == []
    assert len(result["cases"]) == 1 and result["cases"][0]["contributed"] is False
    assert "description" not in result["cases"][0] and "resident_id" not in result["cases"][0]
    login(client, "ana@example.test")
    assert nearby(client).json()["cases"] == []  # her own case is not offered back to her
    assert nearby(client, category="nothing").status_code == 422


def test_related_categories_are_suggested_to_staff_with_a_lower_score(client, photo, monkeypatch):
    monkeypatch.setenv("VALIDATED_EMBEDDING_MODEL_VERSION", "validated-synthetic-v1")
    from barangai import ai
    from barangai.ai import Analysis

    monkeypatch.setattr(
        ai,
        "for_submission",
        lambda _image: Analysis(
            category=None,
            confidence=None,
            source=None,
            needs_check=False,
            problem_seen=True,
            description=None,
            hazards=(),
            embedding=[1.0, 0.0],
            embedding_version="validated-synthetic-v1",
        ),
    )
    flood = resident_report(client, photo, "ana@example.test")
    garbage = resident_report(client, photo, "ben@example.test", resident_category="uncollected_garbage")
    pothole = resident_report(client, photo, "cy@example.test", resident_category="potholes")
    staff_login(client)
    related = client.get(f"/reports/{garbage}/duplicates").json()["suggestions"]
    assert [item["candidate_report_id"] for item in related] == [flood]
    assert related[0]["score"] == pytest.approx(0.9, abs=1e-4)  # 1.0 for an identical photo at the same spot
    assert client.get(f"/reports/{pothole}/duplicates").json()["suggestions"] == []


# Saved preferences


def test_preferences_follow_the_account(client):
    register(client)
    assert client.get("/auth/me").json()["preferences"] == {}
    saved = client.put("/auth/preferences", json={"theme": "dark", "language": "fil"}, headers=headers(client))
    assert saved.status_code == 200 and saved.json()["preferences"] == {"theme": "dark", "language": "fil"}
    assert client.put("/auth/preferences", json={"theme": "neon"}, headers=headers(client)).status_code == 422
    assert client.put("/auth/preferences", json={"theme": "light"}).status_code == 403  # CSRF
    client.put("/auth/preferences", json={"theme": "light"}, headers=headers(client))
    login(client, "resident@example.test")
    assert client.get("/auth/me").json()["preferences"] == {"theme": "light", "language": "fil"}


# Kap's daily brief


def test_brief_counts_the_queue_for_staff_only(client, photo):
    first = resident_report(client, photo, "ana@example.test", resident_category="exposed_wiring")
    resident_report(client, photo, "ben@example.test")
    assert client.get("/staff/brief").status_code == 403
    staff_login(client)
    walk(client, first, "Under Verification", "Accepted", "In Progress", "Resolved", category="exposed_wiring")
    brief = client.get("/staff/brief").json()
    assert brief["source"] == "template"
    assert brief["facts"]["open"] == 1 and brief["facts"]["new_today"] == 2 and brief["facts"]["resolved_today"] == 1
    assert brief["summary"].startswith("1 open report, 1 waiting for review.")
    assert "nalutas" in client.get("/staff/brief", params={"language": "fil"}).json()["summary"]


def cloudflare_answer(monkeypatch, text):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "a" * 32)
    monkeypatch.setenv("CLOUDFLARE_WORKERS_AI_TOKEN", "synthetic-token")
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: httpx.Response(200, json={"success": True, "result": {"response": text}})
    )


def test_brief_uses_the_model_only_when_every_number_is_real(client, photo, monkeypatch):
    resident_report(client, photo, "ana@example.test")
    staff_login(client)
    cloudflare_answer(monkeypatch, "One report is waiting: 1 open, 1 new in the last 24 hours.")
    brief = client.get("/staff/brief").json()
    assert brief["source"] == "workers_ai" and brief["summary"].startswith("One report")
    from barangai import brief as module

    module.clear_cache()
    cloudflare_answer(monkeypatch, "There are 7 open reports and 3 are urgent.")
    brief = client.get("/staff/brief").json()
    assert brief["source"] == "template" and "7" not in brief["summary"]
    module.clear_cache()
    cloudflare_answer(monkeypatch, "Three reports need attention today.")
    assert client.get("/staff/brief").json()["source"] == "template"  # spelled-out numbers are checked too


def test_web_app_manifest_is_served_with_its_type(tmp_path, monkeypatch):
    from barangai.main import create_app, site_app
    from fastapi.testclient import TestClient

    (tmp_path / "index.html").write_text("<!doctype html>")
    (tmp_path / "manifest.webmanifest").write_text("{}")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'site.db').as_posix()}")
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    with TestClient(site_app(create_app(), tmp_path)) as site:
        assert site.get("/manifest.webmanifest").headers["content-type"].startswith("application/manifest+json")
