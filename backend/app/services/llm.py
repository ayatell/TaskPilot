import json
import time
from datetime import date
from pathlib import Path

import httpx

from app.core.config import settings

# shared with your teammate: taskpilot/ml/prompts/system.txt
PROMPT_FILE = Path(__file__).resolve().parents[3] / "ml" / "prompts" / "system.txt"

DEFAULT_PROMPT = """You are TaskPilot, a friendly and encouraging study assistant for students.
Today's date is {today}. Answer in this language: {lang}.
Reply ONLY with a JSON object: {"reply": "...", "actions": [{"type": "create_task", "task": {"title": "...", "description": null, "subject": null, "priority": 2, "due_date": "YYYY-MM-DD or null", "estimated_minutes": 60}}]}
Rules: never invent a deadline. If the student gives no deadline, set due_date to null and ask for it in the reply.
Only propose actions when the student clearly describes work to do. For chitchat or questions, use "actions": [].
priority is 1 (low) to 3 (high). estimated_minutes is between 5 and 1440.
If the student asks to create or modify a task, propose the action immediately with the details of the task. 
If the student asks something you don't know, reply with "I don't know" and do not propose any action. 
{context}
SKILLS
- prioritize: when the student asks what to do first, or asks to organise or order their to-do list, put {"type": "prioritize"} in actions and write one short sentence introducing the result. Do not list or rank the tasks yourself; the app shows the ranking.
- breakdown: when the student describes a big goal (exam, project, report) with a deadline, split it into 4 to 10 create_task actions.
  Each task is one concrete step of 30 to 120 minutes (for example "Read chapter 3 and write notes", not "Study").
  Spread the due_dates between today and the deadline, with the last tasks closest to it.
  Use the same subject for all of them. If there is no deadline, ask for it and propose nothing.
- If a needed detail (like the deadline) is missing, ask for it. Never invent it.
"""

# ---------- rate limiting (HTTP 429) ----------
MAX_RETRIES_429 = 4        # extra attempts after the first one
MAX_WAIT_SECONDS = 45      # never block a request longer than this on one wait
QUIZ_BATCH_SIZE = 8        # questions per LLM call (smaller = fewer tokens per call)
QUIZ_PAUSE_SECONDS = 4     # pause between two batches
QUIZ_CONTEXT_CHARS = 6000  # max course text sent per batch


class LLMUnavailable(Exception):
    pass


def _post_llm(payload: dict, timeout: float = 90) -> dict:
    """POST to the LLM. On 429, wait (Retry-After if given) and retry.

    Raises LLMUnavailable with a readable message on any failure.
    """
    headers = {}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"

    for attempt in range(MAX_RETRIES_429 + 1):
        try:
            resp = httpx.post(
                f"{settings.llm_base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=timeout,
            )
        except httpx.HTTPError as e:
            raise LLMUnavailable(f"Network error: {e}") from e

        if resp.status_code == 429:
            try:
                wait = float(resp.headers.get("retry-after", ""))
            except ValueError:
                wait = min(5 * 2**attempt, 30)  # 5s, 10s, 20s, 30s

            if attempt >= MAX_RETRIES_429 or wait > MAX_WAIT_SECONDS:
                raise LLMUnavailable(
                    "The AI provider rate limit is reached. "
                    f"Please retry in about {int(wait) + 1} seconds "
                    "(or use a smaller quiz / a model with a higher limit)."
                )
            time.sleep(wait + 0.5)
            continue

        if resp.status_code >= 400:
            raise LLMUnavailable(f"{resp.status_code}: {resp.text[:300]}")

        try:
            return resp.json()
        except ValueError as e:
            raise LLMUnavailable("The provider returned an invalid response") from e

    raise LLMUnavailable("The AI provider rate limit is reached. Please retry shortly.")


def _content(data: dict) -> str:
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as e:
        raise LLMUnavailable("Unexpected response format from the provider") from e


def _system_prompt(lang: str, context: str, tasks: str = "") -> str:
    template = PROMPT_FILE.read_text(encoding="utf-8") if PROMPT_FILE.exists() else DEFAULT_PROMPT
    language = "French" if lang == "fr" else "English"
    parts = []
    if tasks:
        parts.append(f"The student's current open tasks:\n{tasks}")
    if context:
        parts.append(f"Course excerpts you may use:\n{context}")
    return (
        template.replace("{today}", date.today().isoformat())
        .replace("{lang}", language)
        .replace("{context}", "\n\n".join(parts))
    )


# ---------- chat ----------
def ask_llm(history: list[dict], lang: str, context: str = "", tasks: str = "") -> dict:
    if not settings.llm_api_key and ("groq" in settings.llm_base_url or "openai" in settings.llm_base_url):
        raise LLMUnavailable("No LLM API key configured. Please set LLM_API_KEY in backend/.env")

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": _system_prompt(lang, context, tasks)},
            *history,
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }

    raw = _content(_post_llm(payload, timeout=60))

    try:
        data = json.loads(raw)
        actions = data.get("actions", [])
        return {
            "reply": str(data.get("reply", "")),
            "actions": actions if isinstance(actions, list) else [],
        }
    except (json.JSONDecodeError, AttributeError):
        return {"reply": raw, "actions": []}   # malformed JSON: keep the text


# ---------- quiz ----------
QUIZ_PROMPT = """You write multiple-choice quizzes for students.
Use ONLY the course excerpts provided.
Write in this language: {lang}.

Reply ONLY with a valid JSON object:
{
  "title": "short quiz title",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": 0,
      "explanation": "one short sentence"
    }
  ]
}

Rules:
- Generate exactly {count} questions.
- Every question must have exactly 4 options.
- There must be exactly one correct option.
- "answer" must be the 0-based index of the correct option (0, 1, 2, or 3).
- Vary the position of the correct answer.
- Questions must be distinct, without repetition.
- Do not invent facts that are not in the course excerpts.
- Return valid JSON only.
"""


def _batch_context(context: str, batch_index: int, total_batches: int) -> str:
    """Give each batch a different, smaller slice of the course text.

    Fewer tokens per call (less chance of a 429) and more varied questions.
    """
    chunks = [c for c in context.split("\n---\n") if c.strip()]
    if len(chunks) > total_batches:
        chunks = chunks[batch_index::total_batches]

    picked, size = [], 0
    for chunk in chunks:
        if size + len(chunk) > QUIZ_CONTEXT_CHARS and picked:
            break
        picked.append(chunk)
        size += len(chunk)
    return "\n---\n".join(picked)[:QUIZ_CONTEXT_CHARS]


def _validate_questions(questions, expected: int) -> None:
    if not isinstance(questions, list):
        raise ValueError("Invalid questions format")
    if len(questions) != expected:
        raise ValueError(f"Expected {expected} questions, received {len(questions)}")
    for question in questions:
        if not isinstance(question, dict):
            raise ValueError("Invalid question format")
        options = question.get("options")
        answer = question.get("answer")
        if not isinstance(options, list) or len(options) != 4:
            raise ValueError("Each question must have exactly 4 options")
        if not isinstance(answer, int) or isinstance(answer, bool) or answer not in range(4):
            raise ValueError("Invalid correct answer index")
        if not question.get("question"):
            raise ValueError("Question text is missing")


def ask_quiz(context: str, lang: str, count: int) -> dict:
    if not settings.llm_api_key:
        raise LLMUnavailable("No LLM API key configured")

    if count < 1:
        raise ValueError("Quiz count must be at least 1")

    language = "French" if lang == "fr" else "English"

    all_questions: list[dict] = []
    quiz_title = None
    total_batches = (count + QUIZ_BATCH_SIZE - 1) // QUIZ_BATCH_SIZE

    for batch_index in range(total_batches):
        if batch_index > 0:
            time.sleep(QUIZ_PAUSE_SECONDS)   # spread the calls over time

        current_count = min(QUIZ_BATCH_SIZE, count - len(all_questions))

        system = (
            QUIZ_PROMPT.replace("{lang}", language)
            .replace("{count}", str(current_count))
        )

        already = ""
        if all_questions:
            titles = "\n".join(f"- {q['question']}" for q in all_questions[-30:])
            already = f"\n\nQuestions already written (do NOT repeat them):\n{titles}"

        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"Course excerpts:\n{_batch_context(context, batch_index, total_batches)}"
                    f"\n\nGenerate batch {batch_index + 1} of {total_batches}."
                    f"{already}"
                ),
            },
        ]

        batch_data = None

        # Retry once if the model returns an incomplete or invalid batch.
        # Rate limits (429) are handled inside _post_llm and are not retried here.
        for attempt in range(2):
            try:
                data = _post_llm(
                    {
                        "model": settings.llm_model,
                        "messages": messages,
                        "response_format": {"type": "json_object"},
                        "temperature": 0.4,
                    },
                    timeout=180,
                )
                parsed = json.loads(_content(data))
                if not isinstance(parsed, dict):
                    raise ValueError("Response is not a JSON object")

                _validate_questions(parsed.get("questions"), current_count)
                batch_data = parsed
                break

            except (json.JSONDecodeError, ValueError) as e:
                if attempt == 1:
                    raise LLMUnavailable(
                        f"Quiz generation failed for batch {batch_index + 1}: {e}"
                    ) from e

                messages.append({
                    "role": "user",
                    "content": (
                        f"Your previous response was invalid: {e}. "
                        f"Return exactly {current_count} valid questions "
                        "following the required JSON format."
                    ),
                })
                time.sleep(2)

        if batch_data is None:
            raise LLMUnavailable("Quiz generation failed")

        if quiz_title is None:
            quiz_title = batch_data.get("title", "Generated Quiz")

        all_questions.extend(batch_data["questions"])

    return {
        "title": quiz_title or "Generated Quiz",
        "questions": all_questions,
    }


# ---------- summary ----------
SUMMARY_PROMPT = """You write clear study summaries for students.
Use ONLY the course excerpts provided. Write in this language: {lang}.
Start with one title line prefixed by "# ". Then organise the summary in short sections ("## ..."), use bullet points for key ideas, and end with a short "Key takeaways" section (written in the target language).
Do not invent facts that are not in the excerpts.
Reply with the summary text only: no JSON, no preamble."""


def ask_summary(context: str, lang: str) -> str:
    if not settings.llm_api_key:
        raise LLMUnavailable("No LLM API key configured")

    system = SUMMARY_PROMPT.replace("{lang}", "French" if lang == "fr" else "English")
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Course excerpts:\n{context}"},
        ],
        "temperature": 0.3,
    }

    text = _content(_post_llm(payload, timeout=120)).strip()
    if not text:
        raise LLMUnavailable("The model returned an empty summary")
    return text