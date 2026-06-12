from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "sandbox"
    assert isinstance(body["version"], str) and body["version"]
    assert body["uptimeSeconds"] >= 0
    assert "timestamp" in body
