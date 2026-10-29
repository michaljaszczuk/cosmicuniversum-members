"""AI loop with a fake model client. Demo data only.

    py -m pytest tools/shop/test_pipeline.py -q
"""
import copy
import json

import pytest

import pipeline
import testkit

MODELS = {"writer": "m-writer", "checker": "m-checker"}


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


def fence(obj):
    return "Here it is:\n```json\n" + json.dumps(obj) + "\n```"


def run(replies):
    client = FakeClient(replies)
    content, usage = pipeline.run_ai(facts(), testkit.json.loads((testkit.HERE / "library.json").read_text(encoding="utf-8")),
                                     client, MODELS, prompts=PROMPTS)
    return content, usage, client


PROMPTS = {"writer": "WRITER PROMPT", "checker": "CHECKER PROMPT", "ticket": "TICKET"}


def test_happy_path_is_writer_then_checker():
    content, usage, client = run([fence(good()), "x | 1 | OK\nTOTAL FAIL = 0"])
    assert [c[0] for c in client.calls] == ["m-writer", "m-checker"]
    assert [c[1] for c in client.calls] == ["WRITER PROMPT", "CHECKER PROMPT"]
    assert content == good()
    assert len(usage) == 2


def test_validator_error_goes_back_to_the_writer_without_the_checker():
    content, _, client = run([json.dumps(with_bad_mars(good())), json.dumps(good()), "TOTAL FAIL = 0"])
    assert [c[0] for c in client.calls] == ["m-writer", "m-writer", "m-checker"]
    assert "planet.Mars#1" in client.calls[1][2]


def test_checker_fail_lines_go_back_to_the_writer():
    fail = "planet.Venus | 1 | FAIL | too strong | goes further than the library\nTOTAL FAIL = 1"
    _, _, client = run([json.dumps(good()), fail, json.dumps(good()), "TOTAL FAIL = 0"])
    assert "planet.Venus | 1 | FAIL" in client.calls[2][2]


def test_three_failed_rounds_stop():
    fail = "a | 1 | FAIL | x | y\nTOTAL FAIL = 1"
    with pytest.raises(pipeline.PipelineError) as e:
        run([json.dumps(good()), fail] * 3)
    assert "3 rounds" in str(e.value)
    assert "Your Sun" not in str(e.value)


def test_no_prompt_names_the_customer():
    _, _, client = run([json.dumps(good()), "TOTAL FAIL = 0"])
    for _, system, user in client.calls:
        for s in ("Alex", "Kraków", "1990-03-14", "14 March 1990", "08:30", "07:40"):
            assert s not in user and s not in system, s


def test_broken_json_goes_back_to_the_writer_with_the_parser_message():
    content, usage, client = run(['{"sections": [ broken', json.dumps(good()), "TOTAL FAIL = 0"])
    assert [c[0] for c in client.calls] == ["m-writer", "m-writer", "m-checker"]
    assert "COULD NOT BE READ" in client.calls[1][2] and "line 1 column" in client.calls[1][2]
    assert content == good()
    assert len(usage) == 3


def test_cut_off_reply_stops_and_keeps_the_usage():
    class CutClient(FakeClient):
        def complete(self, model, system, user):
            text, u = super().complete(model, system, user)
            return text, pipeline.Usage(model, 100, 32000, "max_tokens")

    lib = json.loads((testkit.HERE / "library.json").read_text(encoding="utf-8"))
    with pytest.raises(pipeline.PipelineError) as e:
        pipeline.run_ai(facts(), lib, CutClient(["{"]), MODELS, prompts=PROMPTS)
    assert "cut off" in str(e.value) and "32000" in str(e.value)
    assert [u.output_tokens for u in e.value.usage] == [32000]


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
    assert "humanizer" not in p
    assert "WRITE LIKE A PERSON" in p["writer"] and "JSON and nothing else" in p["writer"]
    assert "Sections:" in p["ticket"]
    assert "```" not in p["writer"]


def test_time_limit_stops_the_ai():
    t = [0.0]

    class SlowClient(FakeClient):
        def complete(self, model, system, user):
            t[0] += 600  # each call takes 10 minutes
            return super().complete(model, system, user)

    fail = "a | 1 | FAIL | x | y\nTOTAL FAIL = 1"
    client = SlowClient([json.dumps(good()), fail] * 3)
    lib = json.loads((testkit.HERE / "library.json").read_text(encoding="utf-8"))
    with pytest.raises(pipeline.PipelineError) as e:
        pipeline.run_ai(facts(), lib, client, MODELS, prompts=PROMPTS, deadline=1200, clock=lambda: t[0])
    assert "time limit" in str(e.value)
    assert len(client.calls) == 2


def test_fix_round_merges_only_the_changed_sections():
    mars = next(s for s in good()["sections"] if s["id"] == "planet.Mars")
    content, _, client = run([json.dumps(with_bad_mars(good())), json.dumps({"sections": [mars]}), "TOTAL FAIL = 0"])
    assert content["sections"] == good()["sections"]
    assert "only the sections you changed" in client.calls[1][2]


def test_failure_reason_counts_problem_kinds_without_text():
    kinds = pipeline.problem_kinds(["planet.Mars#1: source not found: lib:x", "intro#2: 25 words (max 22)",
                                    "why.who#1: source not found: lib:y", "planet.Venus | 1 | FAIL | warm heart | z"])
    assert kinds == "2 source not found, 1 words (max 22), 1 checker FAIL"
    assert "warm heart" not in kinds
