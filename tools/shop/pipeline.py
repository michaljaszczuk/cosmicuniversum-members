"""The AI steps of a report, as in tools/report/PROMPT.md:
WRITER -> validate -> CHECKER -> writer fixes (max 3 rounds). The humanizer rules are in the
writer prompt, so the checker reads the final text.

The AI gets only ai_input.redact(facts). Validation always uses the full facts.
Errors (PipelineError) never hold report text or customer data.
"""
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import ai_input
import validate

PROMPT_MD = Path(__file__).resolve().parent.parent / "report" / "PROMPT.md"
MAX_ROUNDS = 3
MAX_TOKENS = 64000  # a full report is about 8000 tokens of JSON; the rest is room, not a target
DEADLINE = 20 * 60  # seconds for all AI steps; systemd stops the worker at 25 minutes


class PipelineError(Exception):
    def __init__(self, msg, usage=()):
        super().__init__(msg)
        self.usage = list(usage)  # the calls made before the error, so the log shows the real cost


@dataclass
class Usage:
    model: str
    input_tokens: int
    output_tokens: int
    stop: str = ""  # the API stop_reason; "max_tokens" means the reply was cut off
    cache_write: int = 0  # input tokens stored in the prompt cache (billed at 1.25 x input)
    cache_read: int = 0  # input tokens read from the prompt cache (billed at 0.1 x input)


class ModelClient(Protocol):
    def complete(self, model: str, system: str, shared: str, user: str) -> tuple[str, Usage]: ...


class AnthropicClient:
    def __init__(self, api_key):
        import anthropic  # only on the VPS path; tests use a fake client
        # One call may take a while (long JSON), but never more than 5 minutes per try.
        self.client = anthropic.Anthropic(api_key=api_key, timeout=300, max_retries=2)

    def complete(self, model, system, shared, user):
        # `shared` is the same in every call of a role (ticket, facts, library): the API caches it,
        # so later calls pay 0.1 x for it. Long JSON replies: stream, so the SDK does not refuse them.
        content = [{"type": "text", "text": shared, "cache_control": {"type": "ephemeral"}},
                   {"type": "text", "text": user}]
        with self.client.messages.stream(model=model, max_tokens=MAX_TOKENS, system=system,
                                         messages=[{"role": "user", "content": content}]) as s:
            msg = s.get_final_message()
        text = "".join(b.text for b in msg.content if b.type == "text")
        u = msg.usage
        return text, Usage(model, u.input_tokens, u.output_tokens, msg.stop_reason or "",
                           getattr(u, "cache_creation_input_tokens", 0) or 0,
                           getattr(u, "cache_read_input_tokens", 0) or 0)


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
    return {"writer": block("Prompt 1"), "checker": block("Prompt 2"), "ticket": ticket.group(1).strip()}


def parse_json_reply(text):
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.S)
    raw = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        # Position and parser message only: never report text in an error.
        raise PipelineError(f"model reply is not JSON ({e.msg} at line {e.lineno} column {e.colno}, "
                            f"{len(text)} characters)") from None
    except ValueError:
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


# Problem kinds for the failure reason: rule names only, never report text.
KINDS = ("source not found", "not in the cited sources", "no src", "must cite the chart", "words (max 22)",
         "dash", "curly quotes", "banned word", "prediction", "health/money/legal", "missing section",
         "reading grade", "meta source", "theme", "Rising is", "birth rune", "life path", "is in")


def problem_kinds(problems):
    """'9 source not found, 4 checker FAIL' from validator errors and checker FAIL lines."""
    counts = {}
    for p in problems:
        kind = "checker FAIL" if "| FAIL" in p else next((k for k in KINDS if k in p), "other")
        counts[kind] = counts.get(kind, 0) + 1
    return ", ".join(f"{n} {k}" for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))


def merge_fix(content, fix):
    """The writer returns only the sections it changed. Put them in place, keep the rest."""
    by_id = {s["id"]: s for s in fix["sections"]}
    merged = [by_id.pop(s["id"], s) for s in content["sections"]] + list(by_id.values())
    not_covered = sorted(set(content.get("not_covered", [])) | set(fix.get("not_covered", [])))
    return {**content, "sections": merged, "not_covered": not_covered}


def numbered(content):
    """CONTENT for the checker: every sentence carries its number "n", counted from 1."""
    secs = [{**sec, "sentences": [{"n": i, **x} for i, x in enumerate(sec["sentences"], 1)]}
            for sec in content["sections"]]
    return {**content, "sections": secs}


def with_sentence(line, content):
    """A checker FAIL line plus the sentence it is about, so the writer fixes the right one."""
    parts = [x.strip() for x in line.split("|")]
    try:
        sec = next(x for x in content["sections"] if x["id"] == parts[0])
        return f"{line}\n    THE SENTENCE: {sec['sentences'][int(parts[1]) - 1]['text']}"
    except (StopIteration, IndexError, ValueError):
        return line


def run_ai(facts, library, client, models, check=validate.check, prompts=None, deadline=DEADLINE,
           clock=time.monotonic, trace=None):
    """trace(title, text), when given, gets the report text of every round. It is for a private
    file only (see worker.py DEBUG_DIR): the text must never go to a log, an alert or git."""
    usage = []
    try:
        return _run_ai(facts, library, client, models, check, prompts or load_prompts(), deadline, clock, usage,
                       trace or (lambda title, text: None))
    except PipelineError as e:
        raise PipelineError(str(e), usage) from None


def _run_ai(facts, library, client, models, check, prompts, deadline, clock, usage, trace):
    end = clock() + deadline
    shown = f"FACTS\n{_js(ai_input.redact(facts))}\n\nLIBRARY\n{_js(library)}"
    # The same text in every call of a role, so the API caches it. Only the end of the message changes.
    shared = {"writer": f"JOB TICKET\n{prompts['ticket']}\n\n{shown}", "checker": shown}

    def ask(role, user):
        if clock() >= end:
            raise PipelineError(f"ai: time limit of {deadline // 60} minutes reached")
        text, u = client.complete(models[role], prompts[role], shared[role], user)
        usage.append(u)
        if u.stop == "max_tokens":
            # Where the JSON starts tells notes-before-the-JSON from a JSON that is too long. No text.
            raise PipelineError(f"{role}: reply cut off at the token limit ({u.output_tokens} tokens, "
                                f"{len(text)} characters, JSON starts at character {text.find('{')})")
        return text

    content, problems = None, []
    for rnd in range(1, MAX_ROUNDS + 1):
        if content is None:
            user = "Write the report now." if not problems else "\n".join(problems)
        else:
            # Only the changed sections come back: a whole report again costs about 20000 output tokens.
            user = (f"YOUR LAST CONTENT\n{_js(content)}\n\n"
                    "FIX THESE PROBLEMS. Return a CONTENT JSON with only the sections you changed. Give each "
                    "changed section whole, with all its sentences. Leave out every section you did not change.\n"
                    + "\n".join(problems))
        try:
            reply = parse_json_reply(ask("writer", user))
            content = reply if content is None else merge_fix(content, reply)
        except PipelineError as e:
            if not str(e).startswith("model reply"):
                raise
            # A broken JSON reply costs one round; the writer gets the parser message and tries again.
            trace(f"round {rnd}: writer reply", str(e))
            problems = [f"YOUR LAST REPLY COULD NOT BE READ: {e}. Return only the CONTENT JSON, valid JSON, "
                        "with every double quote inside a text escaped as \\\"."]
            continue
        trace(f"round {rnd}: content", _js(content))
        errors = check(facts, content).errors
        if errors:
            trace(f"round {rnd}: validator errors", "\n".join(errors))
            problems = errors
            continue
        reply = ask("checker", f"CONTENT\n{_js(numbered(content))}")
        trace(f"round {rnd}: checker reply", reply)
        fails, lines = parse_checker(reply)
        if fails == 0:
            break
        problems = [with_sentence(ln, content) for ln in lines] or [f"TOTAL FAIL = {fails}"]
    else:
        raise PipelineError(f"writer: not clean after {MAX_ROUNDS} rounds ({len(problems)} problems left: "
                            f"{problem_kinds(problems)})")
    return content, usage
