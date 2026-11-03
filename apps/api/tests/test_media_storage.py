import httpx
import pytest
from conftest import register
from test_reports import submit


@pytest.fixture
def storage(monkeypatch):
    from barangai import media

    monkeypatch.setenv("MEDIA_STORAGE", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_synthetic_test_only")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "incident-photos")
    objects, requests = {}, []

    def handle(request):
        requests.append(request)
        assert request.headers["apikey"] == "sb_secret_synthetic_test_only"
        assert "authorization" not in request.headers
        path = request.url.path
        if path == "/storage/v1/bucket/incident-photos":
            return httpx.Response(200, json={"public": False})
        if request.method == "POST":
            assert request.headers["content-type"] == "image/jpeg"
            objects[path.rsplit("/", 1)[-1]] = request.content
            return httpx.Response(200, json={"Key": path})
        if request.method == "GET":
            assert "/object/authenticated/" in path
            return httpx.Response(200, content=objects[path.rsplit("/", 1)[-1]])
        if request.method == "DELETE":
            import json
            for key in json.loads(request.content)["prefixes"]:
                objects.pop(key, None)
            return httpx.Response(200, json=[])
        raise AssertionError(path)

    real_client = httpx.Client
    monkeypatch.setattr(media, "storage_client", lambda: real_client(transport=httpx.MockTransport(handle)))
    return objects, requests


def test_private_storage_upload_download_and_owner_checks(client, photo, storage):
    objects, requests = storage
    register(client)
    response = submit(client, photo)
    assert response.status_code == 201, response.text
    report = response.json()
    assert len(objects) == 1
    assert b"private-gps" not in next(iter(objects.values()))
    image = client.get(f'/reports/{report["id"]}/image')
    assert image.status_code == 200
    assert image.headers["cache-control"] == "private, no-store"
    assert image.headers["content-type"] == "image/jpeg"
    assert "supabase" not in image.text
    count = len(requests)
    client.cookies.clear()
    register(client, "another@example.test")
    assert client.get(f'/reports/{report["id"]}/image').status_code == 404
    assert len(requests) == count


def test_storage_failure_rolls_back_report(client, photo, storage, monkeypatch):
    from barangai import media
    register(client)
    real_client = httpx.Client
    monkeypatch.setattr(media, "storage_client", lambda: real_client(transport=httpx.MockTransport(
        lambda request: httpx.Response(503, json={"message": "private provider error"}))))
    result = submit(client, photo)
    assert result.status_code == 503
    assert "private provider error" not in result.text
    assert client.get("/reports").json() == []


def test_public_bucket_is_refused_before_upload(client, photo, storage, monkeypatch):
    from barangai import media
    register(client)
    calls = []
    def public_bucket(request):
        calls.append(request)
        return httpx.Response(200, json={"public": True})
    real_client = httpx.Client
    monkeypatch.setattr(media, "storage_client", lambda: real_client(transport=httpx.MockTransport(public_bucket)))
    assert submit(client, photo).status_code == 503
    assert [request.method for request in calls] == ["GET"]
    assert client.get("/reports").json() == []


def test_failed_database_commit_removes_new_object(client, photo, storage, monkeypatch):
    from sqlalchemy.orm import Session
    register(client)
    original = Session.commit
    def fail_report_commit(session):
        from barangai.models import Report
        if any(isinstance(item, Report) for item in session.identity_map.values()):
            raise RuntimeError("synthetic database failure")
        return original(session)
    monkeypatch.setattr(Session, "commit", fail_report_commit)
    with pytest.raises(RuntimeError, match="synthetic database failure"):
        submit(client, photo)
    assert storage[0] == {}
    assert client.get("/reports").json() == []


def test_config_rejects_missing_or_public_client_key(monkeypatch):
    from barangai.media import validate_storage_config
    monkeypatch.setenv("MEDIA_STORAGE", "supabase")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with pytest.raises(ValueError):
        validate_storage_config()
    monkeypatch.setenv("SUPABASE_URL", "https://demo.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_publishable_test_only")
    with pytest.raises(ValueError):
        validate_storage_config()


def test_storage_delete_uses_recorded_location(client, photo, storage):
    from barangai.media import delete_image
    register(client)
    report = submit(client, photo).json()
    delete_image(f'supabase:{report["id"]}.jpg')
    assert storage[0] == {}


@pytest.mark.parametrize("failure_mode", ["timeout", "server-error"])
def test_accepted_upload_with_lost_response_is_cleaned_up(client, photo, storage, monkeypatch, failure_mode):
    import json

    from barangai import media

    register(client)
    objects, requests = storage
    real_client = httpx.Client

    def uncertain(request):
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"public": False})
        if request.method == "POST":
            objects[request.url.path.rsplit("/", 1)[-1]] = request.content
            if failure_mode == "server-error":
                return httpx.Response(502, json={"message": "synthetic response loss"})
            raise httpx.ReadTimeout("synthetic response loss")
        if request.method == "DELETE":
            names = json.loads(request.content)["prefixes"]
            assert len(names) == 1
            objects.pop(names[0], None)
            return httpx.Response(200, json=[])
        raise AssertionError(request.method)

    objects["unrelated.jpg"] = b"synthetic unrelated object"
    monkeypatch.setattr(media, "storage_client", lambda: real_client(transport=httpx.MockTransport(uncertain)))
    assert submit(client, photo).status_code == 503
    assert client.get("/reports").json() == []
    assert objects == {"unrelated.jpg": b"synthetic unrelated object"}
    assert [request.method for request in requests] == ["GET", "POST", "DELETE"]


def test_uncertain_upload_cleanup_failure_logs_only_report_identifier(client, photo, storage, monkeypatch, caplog):
    from barangai import media

    register(client)
    names = []
    real_client = httpx.Client

    def unavailable(request):
        if request.method == "GET":
            return httpx.Response(200, json={"public": False})
        if request.method == "POST":
            names.append(request.url.path.rsplit("/", 1)[-1].removesuffix(".jpg"))
            raise httpx.ReadTimeout("synthetic private provider error")
        return httpx.Response(503, json={"message": "synthetic secret detail"})

    monkeypatch.setattr(media, "storage_client", lambda: real_client(transport=httpx.MockTransport(unavailable)))
    assert submit(client, photo).status_code == 503
    assert client.get("/reports").json() == []
    assert names[0] in caplog.text
    assert "sb_secret_" not in caplog.text
    assert "synthetic secret detail" not in caplog.text
    assert "synthetic private provider error" not in caplog.text


def test_rejected_upload_does_not_delete_conflicting_object(client, photo, storage, monkeypatch):
    from barangai import media

    register(client)
    requests = []
    real_client = httpx.Client

    def rejected(request):
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"public": False})
        return httpx.Response(409, json={"message": "synthetic existing object"})

    monkeypatch.setattr(media, "storage_client", lambda: real_client(transport=httpx.MockTransport(rejected)))
    assert submit(client, photo).status_code == 503
    assert [request.method for request in requests] == ["GET", "POST"]


def test_upload_keeps_health_responsive_while_storage_waits(client, photo, monkeypatch):
    import threading
    from concurrent.futures import ThreadPoolExecutor

    from barangai import reports

    register(client)
    entered, release, health_done = threading.Event(), threading.Event(), threading.Event()
    original = reports.save_image

    def slow_storage(*args):
        entered.set()
        assert release.wait(10), "test did not release storage"
        return original(*args)

    def check_health():
        result = client.get("/health")
        health_done.set()
        return result

    monkeypatch.setattr(reports, "save_image", slow_storage)
    with ThreadPoolExecutor(max_workers=2) as pool:
        upload = pool.submit(submit, client, photo)
        try:
            assert entered.wait(5), "upload did not reach storage"
            health = pool.submit(check_health)
            assert health_done.wait(3), "health response waited for upload storage"
            assert health.result().status_code == 200
        finally:
            release.set()
        assert upload.result().status_code == 201
