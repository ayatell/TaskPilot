# TaskPilot — Master System Architecture & Project Checkpoint

> **TaskPilot** is an intelligent, student-centric productivity assistant that bridges natural language conversation, course materials, and mathematical planning to generate realistic, adaptive study schedules.

---

## 1. Executive Summary & Vision

University students frequently struggle with:
1. **Estimation Bias**: Systematically underestimating or overestimating assignment workloads.
2. **Syllabus Disconnect**: Difficulty translating broad course materials and upcoming exams into daily revision blocks.
3. **Fragile Planning**: Discarding entire schedules when unforeseen delays occur.

**TaskPilot solves this through four integrated pillars:**

```
                     ┌──────────────────────────────────────────┐
                     │          TASKPILOT CORE PILLARS          │
                     └────────────────────┬─────────────────────┘
                                          │
       ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
       ▼                  ▼                               ▼                  ▼
┌──────────────┐   ┌──────────────┐               ┌──────────────┐   ┌──────────────┐
│Conversational│   │   Adaptive   │               │ Deterministic│   │Course Document│
│Task Extractor│   │ Calibration  │               │   Planner    │   │     RAG      │
│ (Strict JSON)│   │ (MAB Engine) │               │  (Knapsack)  │   │  (pgvector)  │
└──────────────┘   └──────────────┘               └──────────────┘   └──────────────┘
```

1. **Conversational Task Extraction**: Natural language parser supporting French, English, and mixed prompts. Generates validated task objects with non-committal proposals (never commits without student consent).
2. **Adaptive Duration Calibration (Multi-Armed Bandit)**: Reinforcement learning ($\varepsilon$-greedy MAB) learning personal estimation biases per academic subject over time.
3. **Deadline-Constrained Scheduling**: Deterministic planner packing tasks into user-specified daily study limits without exceeding quotas or missing deadlines.
4. **Course Document RAG**: Document processing pipeline (PDF/text extraction + multilingual embeddings + subject routing) enabling document-grounded quizzes, summaries, and chat queries.

---

## 2. End-to-End System Architecture

```mermaid
graph TD
    User([Student / Browser]) -->|React 18 + TS SPA| Frontend[Frontend - Vite App]
    Frontend -->|JWT Bearer / REST| API[FastAPI Backend]

    subgraph Backend Core
        API --> Auth[Auth & Security /deps.py]
        API --> TaskRouter[Tasks CRUD /tasks]
        API --> PlanRouter[Planner API /planning]
        API --> ChatRouter[Chat & Agent /chat]
        API --> DocRouter[Documents & RAG /documents]
        API --> QuizRouter[Quiz & Summaries /quiz]
        API --> LibRouter[Saved Items /library]
    end

    subgraph AI & Deterministic Engines
        ChatRouter --> LLMEngine[LLM Service - Groq / Ollama]
        ChatRouter --> SkillsEngine[Skills: Prioritization & Breakdown]
        ChatRouter --> SubjRouter[Subject Router]
        PlanRouter --> MABEngine[Bandit Engine - MAB]
        PlanRouter --> KnapsackEngine[Deterministic Knapsack Planner]
        DocRouter --> RAGEngine[Sentence-Transformers Embeddings]
    end

    subgraph Data Layer
        Auth --> DB[(PostgreSQL Database)]
        TaskRouter --> DB
        MABEngine --> DB
        RAGEngine --> DB
        LibRouter --> DB
    end
```

---

## 3. Technology Stack & Specifications

| Component | Technology | Rationale & Specifications |
| :--- | :--- | :--- |
| **Backend Framework** | **FastAPI** (Python 3.11+) | Asynchronous ASGI framework with native OpenAPI/Swagger docs, high throughput, and strict dependency injection. |
| **ORM & Database** | **SQLAlchemy 2.0** (`Mapped[...]`) + **PostgreSQL** | Typed declarative models, relation cascades, native array and JSON column support. |
| **Data Validation** | **Pydantic v2** & `pydantic-settings` | Schema enforcement for API contracts, JSON serialization, and environment configuration. |
| **Authentication** | **PyJWT** (HS256) + **Passlib / bcrypt** | Stateless bearer token authentication, secure password hashing with salt, purpose-claim tokens. |
| **LLM Inference** | **Groq API** (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`) / **Ollama** (`qwen2.5:3b`) | OpenAI-compatible endpoint with low latency and strict `json_object` response format enforcement. |
| **Vector Embeddings** | `paraphrase-multilingual-MiniLM-L12-v2` | 384-dimensional multilingual sentence embeddings for French/English semantic retrieval. |
| **Document Processing** | `pypdf` | Automated PDF page extraction and text chunking with sliding overlap. |
| **Frontend Framework** | **React 18 + TypeScript + Vite** | High-performance Single Page Application (SPA), typed components, and hot module replacement (HMR). |
| **Styling & Design** | **Tailwind CSS v4** + Custom Tokens | Modern utility-first CSS with `@theme` variables, full light/dark mode adaptation, and accessible components. |
| **Testing Suite** | **Pytest** + **TestClient** + **ESLint** | Unit tests for deterministic engines, multitenant security isolation tests, and frontend build validations. |

---

## 4. Repository Directory Structure

```text
taskpilot/
├── CONTEXT.md                    # Master engineering specification & track contract
├── github.md                     # Team collaboration & git branching guide
├── README.md                     # Master project checkpoint & documentation (this file)
├── requirements.txt              # Root Python dependencies
│
├── backend/                      # FASTAPI BACKEND SERVICE
│   ├── app/
│   │   ├── api/                  # REST API Route Endpoints
│   │   │   ├── auth.py           # Register, login, token refresh, password recovery
│   │   │   ├── chat.py           # Multi-turn assistant, RAG injection, skills routing
│   │   │   ├── conversations.py  # Chat session management, themes, and message history
│   │   │   ├── dashboard.py      # Summary metrics (today, upcoming, overdue, progress)
│   │   │   ├── deps.py           # Dependency injection (DB session, get_current_user)
│   │   │   ├── documents.py      # Document upload, PDF text extraction, chunking, subjects
│   │   │   ├── library.py        # Library items CRUD (saved quizzes and summaries)
│   │   │   ├── planning.py       # Schedule generation with Bandit multiplier integration
│   │   │   ├── quiz.py           # RAG-powered quiz generation from tasks or documents
│   │   │   ├── summaries.py      # Course document structured summary generator
│   │   │   └── tasks.py          # Tasks CRUD and atomic /tasks/bulk creation
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings reading backend/.env
│   │   │   └── security.py       # Password hashing (bcrypt) and JWT encoding/decoding
│   │   ├── db/
│   │   │   └── session.py        # SQLAlchemy engine, SessionLocal, declarative Base
│   │   ├── models.py             # 8 Database Models (User, Task, Conversation, Chunk, etc.)
│   │   ├── schemas.py            # Pydantic Schemas for request and response validation
│   │   ├── services/             # Core Business Logic & Algorithms
│   │   │   ├── bandit.py         # Multi-Armed Bandit ε-greedy calibration engine
│   │   │   ├── llm.py            # LLM client, prompt compilation, JSON enforcement, 503 fallback
│   │   │   ├── planner.py        # Deterministic knapsack scheduling algorithm
│   │   │   ├── rag.py            # Sentence-transformers embedding, chunking, retrieval
│   │   │   ├── skills.py         # Deterministic Eisenhower matrix & urgency scorer
│   │   │   └── subject_router.py # Regex & semantic subject resolver across documents
│   │   └── main.py               # FastAPI application setup, CORS, lifespan table creation
│   ├── tests/                    # Backend Automated Test Suite
│   │   ├── test_isolation.py     # Multitenant user data isolation & auth security tests
│   │   ├── test_planner.py       # Planner knapsack algorithm verification
│   │   └── test_skills.py        # Eisenhower matrix & prioritization logic tests
│   ├── pytest.ini                # Pytest configuration
│   ├── smoke_check.py            # End-to-end integration smoke testing script
│   ├── requirements.txt          # Backend Python dependencies
│   └── README.md                 # Dedicated backend documentation
│
└── frontend/                     # REACT 18 + TYPESCRIPT FRONTEND
    ├── src/
    │   ├── components/           # Modular UI Components
    │   │   ├── CalendarView.tsx  # 7-day visual calendar grid with hours slider
    │   │   ├── ChatDock.tsx      # Compact collapsible quick-assistant dock
    │   │   ├── ChatScreen.tsx    # Full-screen conversational AI with document attachments
    │   │   ├── ConcentrationChip.tsx # Floating focus/concentration status chip
    │   │   ├── ConversationSidebar.tsx # Multi-chat history drawer (rename, delete)
    │   │   ├── Header.tsx        # Top navbar with countdown, theme toggle, language switch
    │   │   ├── Library.tsx       # Saved quizzes and course summaries reader
    │   │   ├── QuizPage.tsx      # Quiz generator configuration interface
    │   │   ├── QuizPlayer.tsx    # Interactive quiz taker with instant feedback & scoring
    │   │   ├── SummariesPage.tsx # Document-grounded study summary generator & viewer
    │   │   └── TodoSidebar.tsx   # Fast task creator with duration logger for MAB
    │   ├── pages/
    │   │   ├── Login.tsx         # User authentication with language switch
    │   │   ├── Signup.tsx        # Registration with password strength meter (0-2)
    │   │   └── Workspace.tsx     # Master multi-tab workspace (chat, calendar, library, etc.)
    │   ├── api.ts                # Centralized typed HTTP client with JWT interceptor & ApiError
    │   ├── i18n.tsx              # Bilingual internationalization provider (FR / EN)
    │   ├── theme.tsx             # Theme provider (Light / Dark mode synchronized with <html>)
    │   ├── types.ts              # Shared frontend TypeScript interfaces
    │   ├── utils.ts              # Date manipulation, time formatting, and arithmetic helpers
    │   ├── index.css             # Tailwind CSS v4 styling & color token definitions
    │   ├── App.tsx               # Root component with auth state machine & routing
    │   └── main.tsx              # Vite entrypoint with React StrictMode and Providers
    ├── index.html                # HTML entry template
    ├── vite.config.ts            # Vite 6 + Tailwind v4 plugin configuration
    └── package.json              # NPM dependencies and scripts
```

---

## 5. Backend Deep Dive & API Endpoints

### Database Architecture (`models.py`)
The system enforces strict multitenant isolation (`user_id` foreign keys with `CASCADE` delete):

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    users     │───┬──<│    tasks     │       │ bandit_arms  │
└──────────────┘   │   └──────────────┘       └──────────────┘
       │           ├──<│conversations │               │
       │           │   └──────┬───────┘               │
       │           │          │                       │
       │           │          └───<┌──────────────┐   │
       │           ├──<┌───────────│   messages   │   │
       │           │   │ documents └──────────────┘   │
       │           │   └─────┬─────┘                  │
       │           │         │                        │
       │           │         └───<┌──────────────┐    │
       │           │              │    chunks    │    │
       │           │              └──────────────┘    │
       │           ├──<┌──────────────┐               │
       │           │   │ saved_items  │               │
       │           │   └──────────────┘               │
       │           └──────────────────────────────────┘
```

1. **`users`**: Email (unique index), salted bcrypt hash, default language preference (`fr`/`en`), created timestamp.
2. **`tasks`**: Title, description, subject, priority (1=Low, 2=Med, 3=High), status (`todo`, `doing`, `done`), due date, estimated minutes, actual minutes logged, and applied `bandit_arm`.
3. **`conversations`**: Chat sessions, custom titles, theme customization, timestamps.
4. **`messages`**: Multi-turn history (`user` / `assistant`), text content, and `metadata_json` (stores proposed action payloads and ranking results).
5. **`documents`**: Uploaded student PDFs/text files with subject categorization.
6. **`chunks`**: Text segments (~800 characters, 100-character overlap) with 384-dimensional vector embeddings (`ARRAY(Float)`).
7. **`bandit_arms`**: Reinforcement learning state tracking pulls and running mean rewards per user and subject.
8. **`saved_items`**: Permanent repository for student-generated quizzes and summaries.

---

### REST API Route Endpoints

| Module | Route | Method | Payload / Description |
| :--- | :--- | :---: | :--- |
| **Auth** | `/auth/register` | `POST` | Registers student (`email`, `password`, `lang`). |
| | `/auth/login` | `POST` | Authenticates credentials and returns JWT bearer token. |
| | `/auth/me` | `GET` | Returns current user profile. |
| | `/auth/forgot-password` | `POST` | Generates secure password reset token. |
| | `/auth/reset-password` | `POST` | Sets new password via token verification. |
| **Tasks** | `/tasks` | `GET` | Lists user tasks with status/subject filtering. |
| | `/tasks` | `POST` | Creates single task. |
| | `/tasks/bulk` | `POST` | **Atomic multi-task creation** (used by LLM breakdown skill). |
| | `/tasks/{id}` | `PATCH` | Updates task status, deadlines, or logs actual study duration. |
| | `/tasks/{id}` | `DELETE` | Removes task. |
| **Planning** | `/planning/generate` | `POST` | Generates 7-day schedule with daily availability limits & MAB multipliers. |
| **Chat** | `/chat` | `POST` | Processes natural language messages with RAG context and skills routing. |
| **Conversations** | `/conversations` | `GET` / `POST` | Lists all chat sessions or creates a new conversation. |
| | `/conversations/{id}` | `GET` / `DELETE`| Retrieves full conversation message history or deletes session. |
| **Documents** | `/documents` | `GET` / `POST` | Lists uploaded files or ingests PDFs/text with automatic vector chunking. |
| | `/documents/{id}` | `DELETE` | Removes document and cascades deletion of its vector chunks. |
| **Library** | `/library` | `GET` / `POST` | Lists or archives generated quizzes and summaries. |
| | `/library/{id}` | `DELETE` | Removes saved item. |
| **Quiz** | `/quiz/generate` | `POST` | Creates multiple-choice questions grounded in tasks or course chunks. |
| **Summaries** | `/summaries/generate` | `POST` | Synthesizes structured markdown study guides from documents. |
| **Dashboard** | `/dashboard` | `GET` | Returns task statistics: `today`, `upcoming`, `overdue`, and completion ratio. |
| **Health** | `/health` | `GET` | Returns `{"status": "ok"}` for uptime probes. |

---

## 6. The Intelligence Layer & Core Algorithms

### 1. Adaptive Duration Calibration — Multi-Armed Bandit (`services/bandit.py`)
Students rarely estimate study times accurately. TaskPilot applies an online reinforcement learning algorithm ($\varepsilon$-greedy multi-armed bandit):
- **Discrete Arms (Multipliers)**: $A = [0.8, 1.0, 1.25, 1.5, 2.0]$.
- **Exploration ($\varepsilon = 0.10$)**: 10% of the time, the system explores random multipliers. 90% of the time, it exploits the arm with the highest running average reward.
- **Reward Function**:
  $$r = -\left| \text{ArmMultiplier} - \frac{\text{ActualMinutes}}{\text{EstimatedMinutes}} \right|$$
  The reward is maximized ($0.0$) when the calibrated duration matches reality.
- **Online Update Formula**:
  $$\mu_k \leftarrow \mu_k + \frac{r - \mu_k}{N_k}$$
  Executed automatically when a student marks a task as `done` and logs their actual time.

---

### 2. Deterministic Knapsack Scheduler (`services/planner.py`)
Unlike unpredictable LLM schedulers, TaskPilot uses a deterministic greedy algorithm:
1. Multiplies estimated minutes by the subject's active Bandit arm:
   $$\text{PlannedMinutes} = \text{round}(\text{EstimatedMinutes} \times \text{Multiplier})$$
2. Sorts open tasks by:
   - Earliest `due_date` first (urgent tasks prioritized).
   - Higher priority second ($3 \to 2 \to 1$).
   - Tasks without deadlines placed at the end.
3. Greedily fills daily available study time buckets without exceeding daily maximums. Tasks exceeding daily slots are split into blocks ($\ge 30\text{ min}$).
4. Generates structured warnings for tasks that cannot fit prior to their deadlines.

---

### 3. Task Prioritization Skill (`services/skills.py`)
When a student asks *"What should I do first?"* or *"Prioritize my work"*:
- The LLM delegates ranking to deterministic Python code by returning `{"type": "prioritize"}`.
- Computes days remaining: $\Delta = \text{due\_date} - \text{today}$.
- Computes Urgency Score:
  - $\Delta < 0 \implies \text{Score } 10$ (`overdue`)
  - $\Delta = 0 \implies \text{Score } 9$ (`due_today`)
  - $\Delta \le 2 \implies \text{Score } 7$ (`due_soon`)
  - $\Delta \le 7 \implies \text{Score } 5$ (`due_this_week`)
  - $\Delta > 7 \implies \text{Score } 2$ (`later`)
  - No deadline $\implies \text{Score } 1$ (`no_deadline`)
- Evaluates **Eisenhower Quadrants**:
  - `do_now`: Urgent ($\Delta \le 2$) & Important ($\text{priority} \ge 2$)
  - `schedule`: Important but not urgent
  - `quick`: Urgent but low importance
  - `later`: Low priority & non-urgent
- Final Ranking Score:
  $$\text{CompositeScore} = (\text{UrgencyScore} \times 2) + (\text{Priority} \times 3)$$

---

### 4. Goal Breakdown Skill (`breakdown`)
When a student shares a major objective (e.g. *"I have an Operating Systems exam next week"*):
- Decomposes the goal into **4 to 10 concrete subtasks**.
- Restricts subtasks to actionable blocks of **30 to 120 minutes** each (e.g., *"Read paging notes"*, not *"Study"*).
- Distributes subtask deadlines progressively between today and the target date.
- Emits structured `create_task` actions ready for atomic acceptance via `POST /tasks/bulk`.

---

### 5. Document RAG Pipeline (`services/rag.py` & `subject_router.py`)
- **Ingestion**: PDFs parsed via `pypdf`, split into ~800 character chunks with 100 character overlap.
- **Embeddings**: Transformed into normalized 384-dimensional vectors with `paraphrase-multilingual-MiniLM-L12-v2`.
- **Subject Routing**: Extracts subject mentions via regex; disambiguates using previous chat turns when multiple subjects match.
- **Cosine Similarity Retrieval**: Uses dot product on normalized embeddings to retrieve the top-$k$ relevant chunks within the user's isolated documents.

---

## 7. Frontend Architecture & User Experience

### State Architecture & Providers
- **`App.tsx`**: State machine maintaining authentication status (`getToken()`). Listens to global `auth:logout` events dispatched on any 401 response.
- **`ThemeProvider` ([theme.tsx](file:///c:/Users/PRIMERO/Desktop/IA%20generative%20textuelle/taskpilot/frontend/src/theme.tsx))**: Controls dark/light modes. Synchronizes with `document.documentElement.classList` (`dark`) and persists preference in `localStorage`.
- **`I18nProvider` ([i18n.tsx](file:///c:/Users/PRIMERO/Desktop/IA%20generative%20textuelle/taskpilot/frontend/src/i18n.tsx))**: Complete bilingual dictionary (French & English) with variable string interpolation (`{n}`).
- **`api.ts`**: Centralized, strongly typed HTTP client with custom `ApiError` class, JSON parsing, and bearer token attachment.

---

### View & Component Modules

```
┌────────────────────────────────────────────────────────────────────────┐
│                               Header                                   │
│  🧭 TaskPilot   [Countdown Badge]   [Focus Toggle]   [EN/FR]   [Theme] │
├────────────────────────────────────────────────────────────────────────┤
│  Tabs: [💬 Assistant]  [📅 Planning]  [📝 Quiz]  [📄 Summaries] [📚 Library]
├────────────────────────────────┬───────────────────────────────────────┤
│                                │                                       │
│    Active Tab View             │   Contextual Panels                   │
│    - ChatScreen (with RAG)     │   - TodoSidebar (Priority / Minutes)  │
│    - CalendarView (7-Day Grid) │   - ConversationSidebar (History)     │
│    - QuizPlayer (Interactive)  │                                       │
│    - Library (Saved Artifacts) │                                       │
│                                │                                       │
└────────────────────────────────┴───────────────────────────────────────┘
```

1. **`Workspace.tsx`**: Primary coordinator rendering tabbed views:
   - **Assistant (`chat`)**: Interactive chat with document attachment and task proposals.
   - **Planning (`calendar`)**: Split view of `TodoSidebar` and `CalendarView`.
   - **Quiz (`quiz`)**: Generator and interactive player for multiple-choice quizzes.
   - **Summaries (`summaries`)**: Document-grounded study summary viewer.
   - **Library (`library`)**: Searchable archive of generated quizzes and summaries.
2. **`ChatScreen.tsx`**: Full-featured chat window supporting document uploads (up to 10 MB), starter buttons (*"Quiz me"*, *"Summarize"*, *"To-do list"*), and one-click acceptance of proposed tasks.
3. **`CalendarView.tsx`**: Weekly visualization stacking planned task blocks starting at 09:00, with an interactive hours-per-day capacity slider.
4. **`TodoSidebar.tsx`**: Task management sidebar with quick-add forms, priority tags, and a completion modal to log actual minutes for bandit calibration.
5. **`QuizPlayer.tsx`**: Step-by-step quiz taker with instant validation, explanations, and final score reporting.
6. **`Signup.tsx` & `Login.tsx`**: Authentication screens featuring client-side password strength meter (0=Weak, 1=Medium, 2=Strong), language selector, and validation.

---

## 8. Setup, Installation & Running

### Prerequisites
- **Python**: Version 3.11 or higher
- **Node.js**: Version 18 or higher (with `npm`)
- **PostgreSQL**: Version 15 or higher running locally on port 5432

---

### Step 1: Database Setup
Create the PostgreSQL database and user:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE USER taskpilot WITH SUPERUSER LOGIN PASSWORD 'mypassword123'; CREATE DATABASE taskpilot OWNER taskpilot;"
```

---

### Step 2: Backend Setup
1. Navigate to `backend`:
   ```powershell
   cd backend
   ```
2. Activate your virtual environment:
   ```powershell
   ..\.venv\Scripts\Activate.ps1
   ```
3. Create your `backend/.env` file:
   ```env
   DATABASE_URL=postgresql+psycopg://taskpilot:mypassword123@localhost:5432/taskpilot
   JWT_SECRET=your_generated_secret_key_here
   LLM_BASE_URL=https://api.groq.com/openai/v1
   LLM_MODEL=openai/gpt-oss-120b
   LLM_API_KEY=gsk_your_groq_api_key_here
   CORS_ORIGINS=http://localhost:5173
   ```
4. Start the backend development server:
   ```powershell
   uvicorn app.main:app --reload
   ```
   Interactive OpenAPI documentation is available at:
   - Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
   - ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### Step 3: Frontend Setup
1. Open a new terminal and navigate to `frontend`:
   ```powershell
   cd frontend
   ```
2. Install npm dependencies:
   ```powershell
   npm install
   ```
3. Create your `frontend/.env` file:
   ```env
   VITE_API_URL=http://localhost:8000
   ```
4. Start the Vite dev server:
   ```powershell
   npm run dev
   ```
   Access the web app at: **[http://localhost:5173](http://localhost:5173)**

---

## 9. Verification & Automated Testing

### 1. Backend Unit & Security Tests
Run the Pytest suite from the `backend` folder:
```powershell
cd backend
python -m pytest tests/test_skills.py tests/test_planner.py
```
- `test_skills.py`: Validates overdue prioritization, quadrant classification, and edge cases.
- `test_planner.py`: Validates deterministic deadline sorting and time-slot allocations.
- `test_isolation.py`: Validates multitenant data isolation (verifying User A cannot read, patch, or delete User B's tasks or documents).

### 2. Backend End-to-End Smoke Check
Run the integration smoke test against a live backend server:
```powershell
cd backend
python smoke_check.py http://localhost:8000
```
Tests the entire pipeline: registration, login, task CRUD, knapsack planning, MAB updates, PDF upload, vector RAG retrieval, quiz generation, and library archiving.

### 3. Frontend Quality Assurance
Verify TypeScript compilation and linting:
```powershell
cd frontend
npm run lint
npm run build
```
- `npm run lint`: Validates ESLint rules with zero warnings or errors.
- `npm run build`: Validates TypeScript (`tsc -b`) and bundles production assets via Vite.

---

## 10. Milestone Checkpoint Status

| Track | Milestone | Status | Details |
| :---: | :--- | :---: | :--- |
| **Backend** | Database Models & Migrations | ✅ Complete | 8 SQLAlchemy 2.0 declarative models with multitenant isolation. |
| **Backend** | Auth & Token Security | ✅ Complete | JWT bearer authentication, bcrypt hashing, password reset flow. |
| **Backend** | Tasks CRUD & Bulk Creation | ✅ Complete | Single task CRUD + `/tasks/bulk` atomic insertion endpoint. |
| **Backend** | Multi-Armed Bandit Engine | ✅ Complete | $\varepsilon$-greedy calibration adjusting estimated durations per subject. |
| **Backend** | Deterministic Knapsack Planner | ✅ Complete | Greedy deadline-constrained scheduling without hallucinations. |
| **Backend** | Vector RAG Pipeline | ✅ Complete | Sentence-transformers embeddings, PDF chunking, cosine retrieval. |
| **Backend** | LLM Engine & Skills | ✅ Complete | Prompt compilation, JSON mode output, 503 fallback, skills routing. |
| **Backend** | Quizzes & Summaries API | ✅ Complete | Document-grounded quiz generation and structured course summaries. |
| **Frontend** | React 18 + Vite Setup | ✅ Complete | Fully typed Vite 6 SPA with Tailwind CSS v4 design system. |
| **Frontend** | Authentication & Onboarding | ✅ Complete | Login & Signup pages with password strength meter and auto-login. |
| **Frontend** | Workspace & Navigation | ✅ Complete | Multi-tab workspace coordinating Assistant, Planning, Quizzes, Library. |
| **Frontend** | Visual Calendar & Planner | ✅ Complete | 7-day schedule grid with capacity slider and warning banners. |
| **Frontend** | Conversational Chat UI | ✅ Complete | Multi-turn chat with RAG attachments, action cards, and task creation. |
| **Frontend** | Interactive Quiz Player | ✅ Complete | Step-by-step quiz taker with immediate answer feedback and scoring. |
| **Frontend** | Internationalization & Theme | ✅ Complete | Full French & English dictionary, dark/light mode toggle with persistence. |
