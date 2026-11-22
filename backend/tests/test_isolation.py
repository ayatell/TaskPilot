import uuid

from fastapi.testclient import TestClient

from app.main import app


def _user(client):
    email = f"{uuid.uuid4().hex[:10]}@test.com"
    client.post("/auth/register", json={"email": email, "password": "password123", "lang": "en"})
    r = client.post("/auth/login", data={"username": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_user_cannot_access_other_users_task():
    with TestClient(app) as client:
        a, b = _user(client), _user(client)
        task = client.post("/tasks", json={"title": "secret"}, headers=a).json()

        assert client.get(f"/tasks/{task['id']}", headers=b).status_code == 404
        assert client.patch(f"/tasks/{task['id']}", json={"title": "x"}, headers=b).status_code == 404
        assert client.delete(f"/tasks/{task['id']}", headers=b).status_code == 404
        assert client.get("/tasks", headers=b).json() == []
        assert client.get(f"/tasks/{task['id']}", headers=a).status_code == 200


def test_requires_authentication():
    with TestClient(app) as client:
        assert client.get("/tasks").status_code == 401
        assert client.get("/dashboard").status_code == 401


def test_documents_are_isolated():
    with TestClient(app) as client:
        a, b = _user(client), _user(client)
        client.post(
            "/documents",
            files={"file": ("note.txt", b"Networks course: TCP uses a three-way handshake.")},
            headers=a,
        )
        assert len(client.get("/documents", headers=a).json()) == 1
        assert client.get("/documents", headers=b).json() == []