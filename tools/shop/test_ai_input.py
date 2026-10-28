"""The AI never sees who the customer is. Demo data only.

    py -m pytest tools/shop/test_ai_input.py -q
"""
import copy
import json

import ai_input
import testkit

BANNED_TOP = {"input", "lons", "timeCheck"}
BANNED_ITEMS = {"name", "birthPlace", "birthDate", "birthTime"}


def facts_with_time_check():
    f = testkit.demo_facts()
    f["timeCheck"] = {"rising": "Taurus", "from": "07:40", "to": "09:05", "sure": 15, "fits": True}
    return f


def test_banned_keys_are_gone():
    out = ai_input.redact(facts_with_time_check())
    assert not BANNED_TOP & set(out)
    assert not BANNED_ITEMS & set(out["items"])


def test_no_identifying_strings_left():
    text = json.dumps(ai_input.redact(facts_with_time_check()), ensure_ascii=False)
    for s in ("Alex", "Kraków", "Krak", "1990-03-14", "14 March 1990", "08:30", "07:30", "50.06", "19.94"):
        assert s not in text, s


def test_saturn_returns_keep_number_and_status_only():
    out = ai_input.redact(testkit.demo_facts())
    assert out["saturnReturns"]
    assert all(set(x) == {"n", "status"} for x in out["saturnReturns"])


def test_original_is_unchanged():
    f = facts_with_time_check()
    before = copy.deepcopy(f)
    ai_input.redact(f)
    assert f == before


def test_chart_facts_stay():
    f = testkit.demo_facts()
    out = ai_input.redact(f)
    assert out["items"]["sun.sign"] == f["items"]["sun.sign"]
    assert out["aspects"] == f["aspects"]
