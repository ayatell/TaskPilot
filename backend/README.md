# TaskPilot — Backend API & LLM Service

The backend of **TaskPilot** is a production-grade, asynchronous REST API built with **FastAPI**, **PostgreSQL** (SQLAlchemy 2.0), and an integrated **LLM conversational engine** designed to transform unstructured student queries into structured, actionable study plans.

---

## 1. Architecture & Tech Stack

```mermaid
graph LR
    Client[Web Frontend / Swagger UI] -->|REST / JWT| API[FastAPI Application]
    API -->|SQLAlchemy 2.0| DB[(PostgreSQL Database)]
    API -->|Prompt + History| LLM[LLM Engine Groq / Ollama]
    API -->|Task Optimization| Skills[Deterministic Skills Engine]
```

| Technology | Purpose |
| :--- | :--- |
| **FastAPI** | High-performance, asynchronous web framework with native OpenAPI / Swagger documentation |
| **PostgreSQL & psycopg3** | Relational database for users, tasks, conversations, and chat history |
| **SQLAlchemy 2.0** | Fully typed ORM (`Mapped[...]`, declarative models) |
| **Pydantic v2** | Request validation, serialization, and `.env` settings management |
| **PyJWT & Passlib / bcrypt** | Stateless authentication with HS256 tokens and secure password hashing |
| **HTTPX** | Asynchronous / synchronous HTTP client for LLM inference calls |
| **Pytest** | Automated unit and integration testing suite |

---

## 2. Project Directory Structure

```text
backend/
├── app/
│   ├── api/                     # REST API route handlers
│   │   ├── auth.py              # User registration, login (JWT), password recovery
│   │   ├── tasks.py             # CRUD operations for tasks (single + bulk creation)
│   │   ├── dashboard.py         # Summary metrics (today, upcoming, overdue, completion %)
│   │   ├── chat.py              # Conversational endpoint with LLM & skills integration
│   │   └── deps.py              # Dependency injection (DB session, current user auth)
│   ├── core/                    # Core system utilities
│   │   ├── config.py            # Pydantic Settings reading backend/.env
│   │   └── security.py          # Password hashing (bcrypt) and JWT encoding/decoding
│   ├── db/                      # Database configuration
│   │   └── session.py           # Engine setup, SessionLocal, declarative Base
│   ├── models.py                # Database models (User, Task, Conversation, Message)
│   ├── schemas.py               # Pydantic validation schemas (requests & responses)
│   ├── services/                # Business logic & AI modules
│   │   ├── llm.py               # Prompt compilation, LLM HTTP client, JSON extraction
│   │   └── skills.py            # Deterministic Eisenhower matrix & task priority ranking
│   └── main.py                  # FastAPI app factory, CORS, lifespan startup, router mounting
├── tests/                       # Unit and integration tests
│   └── test_skills.py           # Verification of prioritization matrix & edge cases
├── requirements.txt             # Python dependencies
├── .env.example                 # Template for required environment variables
└── README.md                    # Backend documentation
```

---

## 3. Database Models

The database schema is defined in [backend/app/models.py](file:///c:/Users/PRIMERO/Desktop/IA%20generative%20textuelle/taskpilot/backend/app/models.py) using SQLAlchemy 2.0:

1. **`User`**: Account identity (`id`, `email`, `hashed_password`, `lang` (`fr` or `en`), `created_at`).
2. **`Task`**: Student task attributes:
   - `title`: Short summary (up to 200 chars).
   - `description`: Optional detailed description.
   - `subject`: Academic discipline (e.g., Math, OS, Networks).
   - `priority`: 1 (Low), 2 (Medium), 3 (High).
   - `status`: `todo`, `doing`, `done`.
   - `due_date`: Specific target date or `null`.
   - `estimated_minutes` & `actual_minutes`: Planned vs. actual study duration.
   - `bandit_arm`: Applied calibration multiplier.
3. **`Conversation`**: Grouping container for chat sessions linked to a specific user.
4. **`Message`**: Individual messages (`role`: `user` | `assistant`, `content`, `timestamp`).

---

## 4. API Endpoints Overview

| Category | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/auth/register` | Create a new user account |
| | `POST` | `/auth/login` | Authenticate and obtain JWT bearer token |
| | `POST` | `/auth/forgot-password` | Request password reset token |
| | `POST` | `/auth/reset-password` | Set a new password using reset token |
| **Tasks** | `GET` | `/tasks` | List all tasks for current user (filters by status/subject) |
| | `POST` | `/tasks` | Create a single task |
| | `POST` | `/tasks/bulk` | Create multiple tasks in a single transaction (used by breakdowns) |
| | `GET` | `/tasks/{id}` | Retrieve specific task details |
| | `PATCH` | `/tasks/{id}` | Update status, deadline, duration, or details |
| | `DELETE` | `/tasks/{id}` | Remove a task |
| **Dashboard** | `GET` | `/dashboard` | Aggregated views: `today`, `upcoming`, `overdue`, and `progress` count |
| **Chat** | `POST` | `/chat` | Conversational assistant with task extraction & skill execution |
| **Health** | `GET` | `/health` | Server health check endpoint |

---

## 5. The LLM Engine (`services/llm.py`)

The LLM module provides a structured, fail-safe communication pipeline between students and Large Language Models.

### Provider Flexibility
- **Groq API (Cloud / Fast Inference)**: Recommended for prototyping using `llama-3.3-70b-versatile`.
- **Ollama (Local / Private)**: Seamlessly compatible with local instances (e.g. `qwen2.5:3b`, `llama-3.2-3b`) by changing `LLM_BASE_URL` to `http://localhost:11434/v1`.

### Prompt Compilation & Context Augmentation
Before sending requests, `_system_prompt()` dynamically compiles:
1. **Current Date**: Prevents hallucinated references to past/future days (`Today's date is {today}`).
2. **User Language**: Supports English (`en`) and French (`fr`).
3. **Current Open Tasks**: Injects the student's open task backlog so the model knows existing workloads and IDs.
4. **Course Excerpts (RAG)**: Injects relevant academic course notes when querying uploaded documents.

### Strict JSON Output Contract
The model is instructed to output strictly valid JSON matching this schema:
```json
{
  "reply": "Conversational, encouraging message for the student.",
  "actions": [
    {
      "type": "create_task",
      "task": {
        "title": "Read Chapter 4 - Database Systems",
        "description": "Focus on indexing and B-trees",
        "subject": "Databases",
        "priority": 2,
        "due_date": "2026-11-28",
        "estimated_minutes": 90
      }
    }
  ]
}
```

### Safety & Resilience
- **Pre-saving Messages**: The student's message is persisted in PostgreSQL **before** calling the LLM. If the provider experiences downtime, no user input is lost.
- **503 Fallback**: If the API key is missing, rate-limited, or network fails, the backend catches the error and raises `HTTPException(503)` with a helpful explanation instead of crashing with a `500 Internal Server Error`.
- **Non-committal Task Proposals**: The LLM suggests tasks in the `actions` payload; tasks are only permanently written to the database when the student approves them.

---

## 6. Skills Added for the LLM

Rather than asking the LLM to perform complex mathematical rankings or ungrounded planning (which are prone to hallucinations), TaskPilot pairs the LLM with **deterministic skills**:

```
                       ┌─────────────────────────┐
                       │  Student Natural Query  │
                       └────────────┬────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │  LLM Intent Detection   │
                       └──────┬───────────┬──────┘
                              │           │
         Intent: "Prioritize" │           │ Intent: "Break Down"
                              ▼           ▼
        ┌────────────────────────┐     ┌────────────────────────┐
        │  prioritize Skill      │     │  breakdown Skill       │
        │  (Eisenhower Matrix +  │     │  (Subtask generation + │
        │   Deterministic Score) │     │   Timeline Spreading)  │
        └────────────────────────┘     └────────────────────────┘
```

### 1. Task Prioritization Skill (`prioritize`)
- **Trigger**: When the student asks questions like *"What should I do first?"*, *"Order my to-do list"*, or *"What's most urgent?"*.
- **Mechanism**:
  1. The LLM returns `{"type": "prioritize"}` in its `actions` array and writes a short conversational intro.
  2. The backend intercepts this action and calls `skills.prioritize(open_tasks)`.
  3. **Calculation Logic** ([backend/app/services/skills.py](file:///c:/Users/PRIMERO/Desktop/IA%20generative%20textuelle/taskpilot/backend/app/services/skills.py)):
     - Computes days remaining until the deadline: $\Delta = \text{due\_date} - \text{today}$.
     - Assigns an urgency score and label:
       - $\Delta < 0$: Score 10 (`overdue`)
       - $\Delta = 0$: Score 9 (`due_today`)
       - $\Delta \le 2$: Score 7 (`due_soon`)
       - $\Delta \le 7$: Score 5 (`due_this_week`)
       - $\Delta > 7$: Score 2 (`later`)
       - No deadline: Score 1 (`no_deadline`)
     - Classifies tasks into **Eisenhower Quadrants**:
       - `do_now`: Urgent ($\Delta \le 2$) and Important ($\text{priority} \ge 2$)
       - `schedule`: Important but not urgent
       - `quick`: Urgent but low importance
       - `later`: Neither urgent nor important
     - Calculates a composite ranking score:
       $$\text{Score} = (\text{Urgency} \times 2) + (\text{Priority} \times 3)$$
     - Sorts tasks by descending score and deadline.
- **Advantage**: 100% deterministic, zero hallucinations, instant response.

---

### 2. Goal Breakdown Skill (`breakdown`)
- **Trigger**: When a student shares a large goal with a deadline (e.g. *"I have a 15-page history report due in two weeks"* or *"Help me study for my Organic Chemistry final"*).
- **Mechanism**:
  1. The LLM breaks the large project into **4 to 10 concrete subtasks**.
  2. Enforces realistic study durations between **30 and 120 minutes** per step (e.g., *"Outline report structure"*, *"Draft introduction"*, rather than vague *"Work on report"*).
  3. Distributes `due_date` values progressively across the remaining time window up to the deadline.
  4. Returns the subtasks as an array of `create_task` proposals, which can be accepted together via `POST /tasks/bulk`.

---

### 3. Strict Task Extraction Rule
- If the student provides a deadline, it is extracted into `YYYY-MM-DD`.
- **Never Invent Deadlines Rule**: If the student did not state a deadline, the model sets `due_date: null` and asks for the deadline in its conversational reply.

---

## 7. Setup & Execution

### 1. Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```
Fill in the values in `backend/.env`:
```env
DATABASE_URL=postgresql+psycopg://taskpilot:mypassword123@localhost:5432/taskpilot
JWT_SECRET=your_generated_jwt_secret_here
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_your_groq_api_key_here
CORS_ORIGINS=http://localhost:5173
```

### 2. Run Database & Backend
Ensure PostgreSQL is running, then launch Uvicorn:
```powershell
cd backend
uvicorn app.main:app --reload
```
Interactive API documentation is accessible at:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 3. Run Tests
Execute the automated test suite with `pytest`:
```powershell
cd backend
python -m pytest
```
