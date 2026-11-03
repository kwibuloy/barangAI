from barangai.main import create_app
from fastapi.testclient import TestClient


def test_single_origin_site_serves_static_and_protected_api(client, tmp_path):
    from barangai.main import site_app

    static = tmp_path / "site"
    static.mkdir()
    (static / "index.html").write_text("<title>Synthetic BarangAI demo</title>")
    (static / "app.js").write_text("console.log('synthetic')")
    (static / ".hidden").write_text("synthetic secret")
    (static / ".git").mkdir()
    (static / ".git" / "config").write_text("synthetic")
    with TestClient(site_app(create_app(), static)) as browser:
        for path in ("/.hidden", "/.git/config", "/api", "/apiX"):
            assert browser.get(path).status_code == 404, path
        assert browser.get("/").status_code == 200
        assert "Synthetic BarangAI" in browser.get("/").text
        assert browser.get("/app.js").status_code == 200
        assert browser.get("/api/health").json() == {"status": "ok"}
        assert browser.get("/api/reports").status_code == 401
        assert browser.get("/api/not-a-route").status_code == 404
        assert browser.get("/.env").status_code == 404
        assert browser.get("/missing.js").status_code == 404
        assert "Synthetic BarangAI" in browser.get("/reports/abc").text  # client route deep link
        assert browser.get("/api/docs").status_code == 200
        assert "url: '/api/openapi.json'" in browser.get("/api/docs").text
        assert browser.get("/").headers["x-content-type-options"] == "nosniff"
        assert browser.get("/api/reports").headers["cache-control"] == "no-store"
        assert (
            browser.post(
                "/api/auth/register",
                json={"email": "resident@example.test", "password": "synthetic password", "role": "staff"},
            ).status_code
            == 403
        )


def test_mounted_api_enforces_early_upload_limit(client, tmp_path, monkeypatch):
    from barangai.main import site_app

    (tmp_path / "index.html").write_text("Synthetic demo")
    monkeypatch.setenv("MAX_REQUEST_BYTES", "100")
    with TestClient(site_app(create_app(), tmp_path)) as browser:
        response = browser.post("/api/reports", files={"image": ("big.jpg", b"x" * 200, "image/jpeg")})
        assert response.status_code == 413
