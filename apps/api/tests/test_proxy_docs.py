from barangai.main import create_app
from fastapi.testclient import TestClient


def test_docs_reference_openapi_beneath_reverse_proxy_prefix(monkeypatch):
    monkeypatch.setenv("API_ROOT_PATH", "/api")
    client = TestClient(create_app())
    response = client.get("/docs")
    assert response.status_code == 200
    assert "url: '/api/openapi.json'" in response.text
