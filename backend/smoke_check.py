import sys
import uuid
from datetime import date, timedelta

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
client = httpx.Client(base_url=BASE, timeout=300)  # long timeout: first document upload downloads the model

failures = 0


def check(name: str, ok: bool, detail=""):
    global failures
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail if not ok else ''}")
    if not ok:
        failures += 1


today = date.today()

# --- auth ---
email = f"{uuid.uuid4().hex[:8]}@test.com"
r = client.post("/auth/register", json={"email": email, "password": "password123", "lang": "en"})
check("register", r.status_code == 201, r.text)
r = client.post("/auth/login", data={"username": email, "password": "password123"})
check("login", r.status_code == 200, r.text)
client.headers["Authorization"] = f"Bearer {r.json()['access_token']}"

# --- 1. tasks ---
ids = []
for title, due, prio in [
    ("Overdue lab report", today - timedelta(days=1), 3),
    ("Networks exam revision", today + timedelta(days=1), 3),
    ("Read chapter 5", today + timedelta(days=5), 1),
]:
    r = client.post("/tasks", json={
        "title": title, "subject": "Networks", "priority": prio,
        "due_date": due.isoformat(), "estimated_minutes": 120,
    })
    check(f"POST /tasks ({title})", r.status_code == 201, r.text)
    if r.status_code == 201:
        ids.append(r.json()["id"])

r = client.get("/tasks")
check("GET /tasks returns 3 tasks", r.status_code == 200 and len(r.json()) == 3, r.text)

# --- 2. planning + bandit feedback ---
availability = {(today + timedelta(days=i)).isoformat(): 120 for i in range(1, 4)}
r = client.post("/planning/generate", json={"availability": availability})
check("POST /planning/generate", r.status_code == 200, r.text)
if r.status_code == 200:
    plan = r.json()
    print(f"       blocks={len(plan['blocks'])} unscheduled={plan['unscheduled']} warnings={len(plan['warnings'])}")

if ids:
    r = client.patch(f"/tasks/{ids[0]}", json={"status": "done", "actual_minutes": 90})
    check("PATCH task done", r.status_code == 200 and r.json()["status"] == "done", r.text)
    print("       now check pgAdmin: SELECT * FROM bandit_arms;  (1 row, pulls = 1)")

# --- 3. dashboard ---
r = client.get("/dashboard")
if r.status_code == 200:
    d = r.json()
    check("GET /dashboard", d["progress"]["done"] == 1 and d["progress"]["total"] == 3, str(d["progress"]))
    print(f"       today={len(d['today'])} upcoming={len(d['upcoming'])} overdue={len(d['overdue'])}")
else:
    check("GET /dashboard", False, r.text)

# --- 4. chat with ranking ---
r = client.post("/chat", json={"message": "What should I do first?"})
if r.status_code == 503:
    check("POST /chat (ranking)", False, "503: LLM unreachable, check LLM_API_KEY in .env")
else:
    body = r.json() if r.status_code == 200 else {}
    check("POST /chat returns 200", r.status_code == 200, r.text)
    check("chat has ranking", bool(body.get("ranking")), "no ranking in response (model may not have emitted 'prioritize')")
    print(f"       reply: {body.get('reply', '')[:120]}")

# --- 5. documents + chat ---
note = (b"Networks course. TCP establishes a connection with a three-way handshake: "
        b"SYN, SYN-ACK, ACK. UDP is connectionless and does not guarantee delivery.")
r = client.post("/documents", files={"file": ("networks.txt", note, "text/plain")})
check("POST /documents", r.status_code == 201, r.text)
r = client.get("/documents")
check("GET /documents lists 1", r.status_code == 200 and len(r.json()) == 1, r.text)

r = client.post("/chat", json={"message": "Summarize my course"})
if r.status_code == 200:
    reply = r.json()["reply"]
    check("chat mentions document content", "handshake" in reply.lower() or "tcp" in reply.lower(), reply[:200])
else:
    check("POST /chat with document", False, f"{r.status_code} {r.text}")

print("\nALL GOOD" if failures == 0 else f"\n{failures} check(s) failed")
sys.exit(1 if failures else 0)