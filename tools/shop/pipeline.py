"""The AI steps of a report, as in tools/report/PROMPT.md:
WRITER -> validate -> CHECKER -> writer fixes (max 3 rounds) -> HUMANIZER -> validate.

The AI gets only ai_input.redact(facts). Validation always uses the full facts.
Errors (PipelineError) never hold report text or customer data.
"""
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import ai_input
import validate

PROMPT_MD = Path(__file__).resolve().parent.parent / "report" / "PROMPT.md"
MAX_ROUNDS = 3
SENTENCE_ERROR = re.compile(r"^([\w.]+)#\d+:")


class PipelineError(Exception):
    pass


@dataclass
class Usage:
    model: str
    input_tokens: int
    output_tokens: int


class ModelClient(Protocol):
    def complete(self, model: str, system: str, user: str) -> tuple[str, Usage]: ...


class AnthropicClient:
    def __init__(self, api_key):
        import anthropic  # only on the VPS path; tests use a fake client
        self.client = anthropic.Anthropic(api_key=api_key)

    def complete(self, model, system, user):
        # Long JSON replies: stream, so the SDK does not refuse a long request.
        with self.client.messages.stream(model=model, max_tokens=32000, system=system,
                                         messages=[{"role": "user", "content": user}]) as s:
            msg = s.get_final_message()
        text = "".join(b.text for b in msg.content if b.type == "text")
        return text, Usage(model, msg.usage.input_tokens, msg.usage.output_tokens)


def load_prompts(path=PROMPT_MD):
    md = Path(path).read_text(encoding="utf-8")

    def block(heading):
        m = re.search(rf"^## {re.escape(heading)}.*?^```text\n(.*?)^```", md, re.M | re.S)
        if not m:
            raise PipelineError(f"PROMPT.md: no text block under '{heading}'")
        return m.group(1).strip()

    ticket = re.search(r"^## Job ticket.*?\n(.*?)(?=^## |\Z)", md, re.M | re.S)
    if not ticket:
        raise PipelineError("PROMPT.md: no job ticket")
    return {"writer": block("Prompt 1"), "checker": block("Prompt 2"), "humanizer": block("Prompt 3"),
            "ticket": ticket.group(1).strip()}


def parse_json_reply(text):
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.S)
    raw = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        raise PipelineError("model reply is not JSON") from None
    if not isinstance(data, dict) or not isinstance(data.get("sections"), list):
        raise PipelineError("model reply has no sections list")
    return data


def parse_checker(text):
    m = re.search(r"TOTAL FAIL\s*=\s*(\d+)", text)
    if not m:
        raise PipelineError("checker reply has no TOTAL FAIL line")
    fails = [ln.strip() for ln in text.splitlines() if re.search(r"\|\s*FAIL\s*\|", ln)]
    return int(m.group(1)), fails


def _js(obj):
    return json.dumps(obj, ensure_ascii=False)


def _fallback(before, after, errors):
    """Put back every section the humanizer broke. Report-wide errors: use the whole old text."""
    broken = {m.group(1) for e in errors if (m := SENTENCE_ERROR.match(e))}
    if any(not SENTENCE_ERROR.match(e) for e in errors):
        return before
    old = {s["id"]: s for s in before["sections"]}
    merged = [old.get(s["id"], s) if s["id"] in broken else s for s in after["sections"]]
    return {**after, "sections": merged}


def run_ai(facts, library, client, models, check=validate.check, prompts=None):
    prompts = prompts or load_prompts()
    usage = []
    base = (f"JOB TICKET\n{prompts['ticket']}\n\nFACTS\n{_js(ai_input.redact(facts))}\n\n"
            f"LIBRARY\n{_js(library)}")

    def ask(role, user):
        text, u = client.complete(models[role], prompts[role], user)
        usage.append(u)
        return text

    content, problems = None, []
    for _ in range(MAX_ROUNDS):
        user = base if content is None else (
            f"{base}\n\nYOUR LAST CONTENT\n{_js(content)}\n\n"
            "FIX THESE PROBLEMS. Return the whole fixed CONTENT JSON.\n" + "\n".join(problems))
        content = parse_json_reply(ask("writer", user))
        errors = check(facts, content).errors
        if errors:
            problems = errors
            continue
        fails, lines = parse_checker(ask("checker", f"FACTS\n{_js(ai_input.redact(facts))}\n\n"
                                                    f"LIBRARY\n{_js(library)}\n\nCONTENT\n{_js(content)}"))
        if fails == 0:
            break
        problems = lines or [f"TOTAL FAIL = {fails}"]
    else:
        raise PipelineError(f"writer: not clean after {MAX_ROUNDS} rounds ({len(problems)} problems left)")

    try:
        human = parse_json_reply(ask("humanizer", f"CONTENT\n{_js(content)}"))
    except PipelineError:
        return content, usage
    errors = check(facts, human).errors
    final = _fallback(content, human, errors) if errors else human
    if check(facts, final).errors:
        final = content
    if check(facts, final).errors:
        raise PipelineError("content failed validation after the humanizer fallback")
    return final, usage
