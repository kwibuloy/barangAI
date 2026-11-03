import httpx
from barangai import geo
from conftest import register


def test_street_names_are_off_unless_configured(client):
    register(client)
    assert client.get("/geo/reverse", params={"lat": 14.3, "lng": 120.9}).status_code == 503


def test_reverse_lookup_needs_a_session_and_returns_a_short_label(client, monkeypatch):
    monkeypatch.setenv("GEOCODER", "nominatim")
    assert client.get("/geo/reverse", params={"lat": 14.3, "lng": 120.9}).status_code == 401
    register(client)
    sent = []

    def fake_get(url, params, headers, timeout):
        sent.append((params, headers))
        return httpx.Response(
            200,
            json={
                "address": {
                    "road": "Mabini Street",
                    "quarter": "Zone 1",
                    "city": "Dasmariñas",
                    "country": "Philippines",
                }
            },
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    geo.clear_cache()
    response = client.get("/geo/reverse", params={"lat": 14.3294012, "lng": 120.9367088})
    assert response.json() == {"label": "Mabini Street, Zone 1, Dasmariñas"}
    params, headers = sent[0]
    assert (params["lat"], params["lon"]) == (14.3294, 120.9367)  # about 11 m, before leaving the server
    assert headers["User-Agent"].startswith("BarangAI")
    assert client.get("/geo/reverse", params={"lat": 14.3294012, "lng": 120.9367088}).status_code == 200
    assert len(sent) == 1  # cached


def test_geocoder_failure_is_not_an_error(client, monkeypatch):
    monkeypatch.setenv("GEOCODER", "nominatim")
    register(client)

    def boom(*a, **k):
        raise httpx.ConnectTimeout("offline")

    monkeypatch.setattr(httpx, "get", boom)
    geo.clear_cache()
    assert client.get("/geo/reverse", params={"lat": 1.0, "lng": 2.0}).json() == {"label": None}


def test_out_of_range_coordinates_are_rejected(client, monkeypatch):
    monkeypatch.setenv("GEOCODER", "nominatim")
    register(client)
    assert client.get("/geo/reverse", params={"lat": 91, "lng": 0}).status_code == 422


def test_failed_lookups_are_retried(client, monkeypatch):
    monkeypatch.setenv("GEOCODER", "nominatim")
    register(client)
    geo.clear_cache()
    replies = iter([httpx.ConnectTimeout("slow"), httpx.Response(200, json={"address": {"road": "Rizal Avenue"}})])

    def fake_get(*a, **k):
        reply = next(replies)
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(httpx, "get", fake_get)
    assert client.get("/geo/reverse", params={"lat": 3.0, "lng": 4.0}).json() == {"label": None}
    assert client.get("/geo/reverse", params={"lat": 3.0, "lng": 4.0}).json() == {"label": "Rizal Avenue"}


def test_a_skipped_lookup_does_not_lengthen_the_queue(monkeypatch):
    monkeypatch.setattr(geo.time, "monotonic", lambda: 100.0)
    monkeypatch.setattr(geo, "_next_slot", 110.0)
    assert geo.lookup(5.0, 6.0) is None
    assert geo._next_slot == 110.0
