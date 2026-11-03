import base64
import hashlib
import time
from urllib.parse import parse_qs, urlparse

import pytest
from barangai import google_auth
from barangai.auth import attempts, hasher
from barangai.auth import router as auth_router
from barangai.db import Base, database_url, engine_for_url, session_for_url
from barangai.models import OAuthIdentity, User
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def oauth_client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{(tmp_path / 'oauth.db').as_posix()}")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"):
        monkeypatch.delenv(name, raising=False)
    attempts.clear()
    google_auth.pending.clear()
    Base.metadata.create_all(engine_for_url(database_url()))
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(google_auth.router)
    with TestClient(app, base_url="http://localhost", follow_redirects=False) as client:
        yield client


@pytest.fixture
def configured(oauth_client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "synthetic-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "synthetic-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost/auth/google/callback")
    return oauth_client


def begin(client):
    response = client.get("/auth/google/start")
    assert response.status_code == 302
    return response, {key: value[0] for key, value in parse_qs(urlparse(response.headers["location"]).query).items()}


def stub_google(monkeypatch, authorization, **overrides):
    claims = {"sub": "synthetic-google-subject", "email": "google-resident@example.test",
              "email_verified": True, "nonce": authorization["nonce"]}
    claims.update(overrides)
    monkeypatch.setattr(google_auth, "exchange_code", lambda *args: claims)


def test_google_is_hidden_and_unavailable_without_configuration(oauth_client):
    assert oauth_client.get("/auth/google/config").json() == {"enabled": False}
    assert oauth_client.get("/auth/google/start").status_code == 404


def test_start_uses_pkce_and_short_lived_private_cookie(configured):
    response, authorization = begin(configured)
    assert configured.get("/auth/google/config").json() == {"enabled": True}
    assert authorization["scope"] == "openid email"
    assert authorization["code_challenge_method"] == "S256"
    assert authorization["state"] == configured.cookies["google_oauth_state"]
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "Max-Age=600" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    transaction = google_auth.pending[authorization["state"]]
    expected = base64.urlsafe_b64encode(hashlib.sha256(transaction["verifier"].encode()).digest()).rstrip(b"=").decode()
    assert authorization["code_challenge"] == expected


def test_google_creates_resident_then_reuses_subject(configured, monkeypatch):
    _, authorization = begin(configured)
    stub_google(monkeypatch, authorization)
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "synthetic-code"})
    assert response.headers["location"] == "/"
    assert configured.get("/auth/me").json()["role"] == "resident"
    first_id = configured.get("/auth/me").json()["id"]
    with session_for_url() as db:
        assert db.query(OAuthIdentity).count() == 1
    _, authorization = begin(configured)
    stub_google(monkeypatch, authorization)
    configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "second-code"})
    assert configured.get("/auth/me").json()["id"] == first_id
    replay = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "second-code"})
    assert "google_invalid_state" in replay.headers["location"]


@pytest.mark.parametrize("change, expected", [
    ({"nonce": "wrong"}, "google_failed"),
    ({"email_verified": False}, "google_email_unverified"),
    ({"sub": ""}, "google_failed"),
])
def test_untrusted_google_claims_cannot_sign_in(configured, monkeypatch, change, expected):
    _, authorization = begin(configured)
    stub_google(monkeypatch, authorization, **change)
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "code"})
    assert expected in response.headers["location"]
    assert configured.get("/auth/me").status_code == 401


@pytest.mark.parametrize("role", ["resident", "staff", "administrator"])
def test_matching_local_email_is_never_automatically_linked(configured, monkeypatch, role):
    with session_for_url() as db:
        db.add(User(email="google-resident@example.test", password_hash=hasher.hash("synthetic-password"), role=role))
        db.commit()
    _, authorization = begin(configured)
    stub_google(monkeypatch, authorization)
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "code"})
    assert "google_account_exists" in response.headers["location"]
    assert configured.get("/auth/me").status_code == 401


def test_state_is_bound_to_browser_and_expires(configured, monkeypatch):
    _, authorization = begin(configured)
    configured.cookies.clear()
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "code"})
    assert "google_invalid_state" in response.headers["location"]
    _, authorization = begin(configured)
    monkeypatch.setattr(google_auth.time, "monotonic", lambda: float("inf"))
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "code"})
    assert "google_invalid_state" in response.headers["location"]


def test_insecure_nonlocal_redirect_disables_provider(configured, monkeypatch):
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://example.test/auth/google/callback")
    assert configured.get("/auth/google/config").json() == {"enabled": False}
    assert configured.get("/auth/google/start").status_code == 404


def test_linked_identity_cannot_be_used_after_staff_promotion(configured, monkeypatch):
    with session_for_url() as db:
        user = User(email="staff@example.test", password_hash=hasher.hash("synthetic-password"), role="staff")
        db.add(user)
        db.flush()
        db.add(OAuthIdentity(provider="google", subject="synthetic-google-subject", user_id=user.id))
        db.commit()
    _, authorization = begin(configured)
    stub_google(monkeypatch, authorization)
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "code": "code"})
    assert "google_resident_only" in response.headers["location"]
    assert configured.get("/auth/me").status_code == 401


def test_cancelled_sign_in_consumes_state(configured):
    _, authorization = begin(configured)
    response = configured.get("/auth/google/callback", params={"state": authorization["state"], "error": "access_denied"})
    assert "google_cancelled" in response.headers["location"]
    assert authorization["state"] not in google_auth.pending


@pytest.mark.parametrize("invalid", [None, "audience", "expired", "issuer", "signature"])
def test_exchange_uses_pkce_and_google_library_validation(configured, monkeypatch, invalid):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from google.auth import crypt, jwt
    from google.oauth2 import id_token

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    monkeypatch.setattr(id_token, "_fetch_certs", lambda *args: {"synthetic-key": public})
    claims = {"iss": "https://accounts.google.com", "aud": "synthetic-client", "sub": "synthetic-subject",
              "iat": int(time.time()) - 100, "exp": int(time.time()) + 600}
    if invalid == "audience":
        claims["aud"] = "another-client"
    if invalid == "expired":
        claims["exp"] = int(time.time()) - 50
    if invalid == "issuer":
        claims["iss"] = "https://attacker.example.test"
    token = jwt.encode(crypt.RSASigner.from_string(private), claims, key_id="synthetic-key").decode()
    if invalid == "signature":
        parts = token.split(".")
        parts[2] = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
        token = ".".join(parts)

    class FakeHTTP:
        def __init__(self, **kwargs):
            assert kwargs["timeout"] == 15

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, data):
            assert url == "https://oauth2.googleapis.com/token"
            assert data["code_verifier"] == "synthetic-verifier"
            assert data["code"] == "synthetic-code"
            return google_auth.httpx.Response(200, json={"id_token": token}, request=google_auth.httpx.Request("POST", url))

    monkeypatch.setattr(google_auth.httpx, "Client", FakeHTTP)
    if invalid:
        with pytest.raises(Exception):  # noqa: B017  (any rejection will do)
            google_auth.exchange_code("synthetic-code", "synthetic-verifier", google_auth.settings())
    else:
        assert google_auth.exchange_code("synthetic-code", "synthetic-verifier", google_auth.settings())["sub"] == "synthetic-subject"
