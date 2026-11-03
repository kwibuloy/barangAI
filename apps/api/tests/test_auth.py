from conftest import register


def test_registration_creates_resident_and_session(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "resident"
    assert response.json()["email"] == "resident@example.test"
    assert "session=" in response.headers["set-cookie"]
    assert "httponly" in response.headers["set-cookie"].lower()
    assert client.get("/auth/me").json()["id"] == response.json()["id"]


def test_registration_cannot_choose_staff_role(client):
    response = client.post("/auth/register", json={"email": "staff@example.test", "password": "safe-password-123", "role": "staff"})
    assert response.status_code == 403


def test_login_and_logout_revoke_session(client):
    register(client)
    csrf = client.cookies.get("csrf_token")
    assert client.post("/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert client.get("/auth/me").status_code == 401
    response = client.post("/auth/login", json={"email": "resident@example.test", "password": "correct horse battery staple"})
    assert response.status_code == 200
    assert client.get("/auth/me").status_code == 200


def test_password_is_hashed_and_bad_login_fails(client):
    register(client)
    from barangai.db import session_for_url
    from barangai.models import User

    with session_for_url() as db:
        user = db.query(User).first()
        assert user.password_hash.startswith("$argon2id$")
        assert "correct horse battery staple" not in user.password_hash
    assert client.post("/auth/login", json={"email": "resident@example.test", "password": "wrong"}).status_code == 401


def test_csrf_is_required_for_cookie_mutation(client):
    register(client)
    assert client.post("/auth/logout").status_code == 403
    assert client.get("/auth/me").status_code == 200


def test_session_cookie_is_secure_by_default(client, monkeypatch):
    monkeypatch.delenv("COOKIE_SECURE")
    response = register(client)
    assert response.status_code == 201
    assert "secure" in response.headers["set-cookie"].lower()


def test_registration_refuses_role_in_any_casing(client):
    for key in ("Role", " ROLE"):
        response = client.post("/auth/register", json={"email": "x@example.test", "password": "safe-password-123", key: "staff"})
        assert response.status_code == 403
