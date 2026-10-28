"""AI loop with a fake model client. Demo data only.

    py -m pytest tools/shop/test_pipeline.py -q
"""
import copy
import json

import pytest

import pipeline
import testkit

MODELS = {"writer": "m-writer", "checker": "m-checker", "humanizer": "m-humanizer"}


class FakeClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, model, system, user):
        self.calls.append((model, system, user))
        return self.replies.pop(0), pipeline.Usage(model, 100, 50)


def facts():
    f = testkit.demo_facts()
    f["timeCheck"] = {"rising": "Taurus", "from": "07:40", "to": "09:05", "sure": 15, "fits": True}
    return f


def good():
    return testkit.minimal_content(testkit.demo_facts())


def with_bad_mars(content):
    c = copy.deepcopy(content)
    f = testkit.demo_facts()
    wrong = "Leo" if f["items"]["mars.sign"] != "Leo" else "Virgo"
    sec = next(s for s in c["sections"] if s["id"] == "planet.Mars")
    sec["sentences"] = [{"text": f"Mars is in {wrong}.", "src": ["fact:items.mars.sign"]}]
    return c


def humanized(content):
    c = copy.deepcopy(content)
    sec = next(s for s in c["sections"] if s["id"] == "intro")
    sec["sentences"][0]["text"] = sec["sentences"][0]["text"].replace("Your Sun is in", "Your Sun sign is")
    return c


def fence(obj):
    return "Here it is:\n```json\n" + json.dumps(obj) + "\n```"


def run(replies):
    client = FakeClient(replies)
    content, usage = pipeline.run_ai(facts(), testkit.json.loads((testkit.HERE / "library.json").read_text(encoding="utf-8")),
                                     client, MODELS, prompts=PROMPTS)
    return content, usage, client


PROMPTS = {"writer": "WRITER PROMPT", "checker": "CHECKER PROMPT", "humanizer": "HUMANIZER PROMPT", "ticket": "TICKET"}


def test_happy_path_uses_the_three_models():
    content, usage, client = run([fence(good()), "x | 1 | OK\nTOTAL FAIL = 0", json.dumps(humanized(good()))])
    assert [c[0] for c in client.calls] == ["m-writer", "m-checker", "m-humanizer"]
    assert [c[1] for c in client.calls] == ["WRITER PROMPT", "CHECKER PROMPT", "HUMANIZER PROMPT"]
    assert content == humanized(good())
    assert len(usage) == 3


def test_validator_error_goes_back_to_the_writer_without_the_checker():
    content, _, client = run([json.dumps(with_bad_mars(good())), json.dumps(good()), "TOTAL FAIL = 0", json.dumps(good())])
    assert [c[0] for c in client.calls] == ["m-writer", "m-writer", "m-checker", "m-humanizer"]
    assert "planet.Mars#1" in client.calls[1][2]


def test_checker_fail_lines_go_back_to_the_writer():
    fail = "planet.Venus | 1 | FAIL | too strong | goes further than the library\nTOTAL FAIL = 1"
    _, _, client = run([json.dumps(good()), fail, json.dumps(good()), "TOTAL FAIL = 0", json.dumps(good())])
    assert "planet.Venus | 1 | FAIL" in client.calls[2][2]


def test_three_failed_rounds_stop():
    fail = "a | 1 | FAIL | x | y\nTOTAL FAIL = 1"
    with pytest.raises(pipeline.PipelineError) as e:
        run([json.dumps(good()), fail] * 3)
    assert "3 rounds" in str(e.value)
    assert "Your Sun" not in str(e.value)


def test_humanizer_breaking_a_section_puts_that_section_back():
    h = with_bad_mars(humanized(good()))
    content, _, _ = run([json.dumps(good()), "TOTAL FAIL = 0", json.dumps(h)])
    by_id = {s["id"]: s for s in content["sections"]}
    assert by_id["planet.Mars"] == next(s for s in good()["sections"] if s["id"] == "planet.Mars")
    assert by_id["intro"] == next(s for s in humanized(good())["sections"] if s["id"] == "intro")


def test_no_prompt_names_the_customer():
    _, _, client = run([json.dumps(good()), "TOTAL FAIL = 0", json.dumps(good())])
    for _, system, user in client.calls:
        for s in ("Alex", "Kraków", "1990-03-14", "14 March 1990", "08:30", "07:40"):
            assert s not in user and s not in system, s


def test_parse_checker_without_total_raises():
    with pytest.raises(pipeline.PipelineError):
        pipeline.parse_checker("a | 1 | OK")


def test_parse_checker():
    n, lines = pipeline.parse_checker("a | 1 | OK\nb | 2 | FAIL | x | y\nTOTAL FAIL = 1")
    assert n == 1
    assert lines == ["b | 2 | FAIL | x | y"]


def test_parse_json_reply():
    assert pipeline.parse_json_reply(fence({"sections": []})) == {"sections": []}
    assert pipeline.parse_json_reply('ok {"sections": [], "not_covered": []} done') == {"sections": [], "not_covered": []}
    for bad in ("no json here", '{"a": 1}'):
        with pytest.raises(pipeline.PipelineError):
            pipeline.parse_json_reply(bad)


def test_load_prompts_from_prompt_md():
    p = pipeline.load_prompts()
    assert p["writer"].startswith("You write one part of a paid birth chart report")
    assert p["checker"].startswith("You check a birth chart report")
    assert p["humanizer"].startswith("Apply the /humanizer rules")
    assert "Sections:" in p["ticket"]
    assert "```" not in p["writer"]
