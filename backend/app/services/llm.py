import json
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


class LLMUnavailable(Exception):
    pass


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


def ask_llm(history: list[dict], lang: str, context: str = "", tasks: str = "") -> dict:
    if not settings.llm_api_key and ("groq" in settings.llm_base_url or "openai" in settings.llm_base_url):
        raise LLMUnavailable("No LLM API key configured. Please set LLM_API_KEY in backend/.env")

    headers = {}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": _system_prompt(lang, context, tasks)},
            *history,
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }

    try:
        resp = httpx.post(
            f"{settings.llm_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json=payload,
            timeout=30,
        )
        if resp.status_code >= 400:
            raise LLMUnavailable(f"{resp.status_code}: {resp.text}")
        raw = resp.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise LLMUnavailable(str(e)) from e
    except Exception as e:
        raise LLMUnavailable(f"LLM request error: {e}") from e

    try:
        data = json.loads(raw)
        actions = data.get("actions", [])
        return {
            "reply": str(data.get("reply", "")),
            "actions": actions if isinstance(actions, list) else [],
        }
    except (json.JSONDecodeError, AttributeError):
        return {"reply": raw, "actions": []}   # malformed JSON: keep the text

QUIZ_PROMPT = """You write multiple-choice quizzes for students.
Use ONLY the course excerpts provided. Write in this language: {lang}.
Reply ONLY with a JSON object:
{"title": "short quiz title", "questions": [{"question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "one short sentence"}]}
Rules: exactly {count} questions, 4 options each, exactly one correct option.
"answer" is the 0-based index of the correct option. Vary the position of the correct answer.
Do not invent facts that are not in the excerpts."""


def ask_quiz(context: str, lang: str, count: int) -> dict:
    if not settings.llm_api_key:
        raise LLMUnavailable("No LLM API key configured")
    system = (
        QUIZ_PROMPT.replace("{lang}", "French" if lang == "fr" else "English")
        .replace("{count}", str(count))
    )
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Course excerpts:\n{context}"},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
    }
    try:
        resp = httpx.post(
            f"{settings.llm_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        return json.loads(resp.json()["choices"][0]["message"]["content"])
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise LLMUnavailable(str(e)) from e
