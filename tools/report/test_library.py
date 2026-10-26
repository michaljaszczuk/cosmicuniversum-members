"""Tests for the V2 report meanings in tools/report/library.json.

    py -m pytest tools/report/test_library.py -q
"""
import json
import re
import unittest
from pathlib import Path

import validate

LIB = json.loads((Path(__file__).parent / "library.json").read_text(encoding="utf-8"))
SIGN_FIELDS = ("drives", "likes", "dislikes", "drains", "needs")
POINTS = ("Ascendant", "Midheaven", "Chiron", "NorthNode", "SouthNode")


def new_texts():
    for s, row in LIB["sign"].items():
        for f in SIGN_FIELDS:
            yield f"sign.{s}.{f}", row.get(f, "")
    for h, row in LIB["house"].items():
        yield f"house.{h}.pulls", row.get("pulls", "")
    for p, row in LIB["planet"].items():
        yield f"planet.{p}.short", row.get("short", "")
    for p in POINTS:
        yield f"point.{p}.short", LIB["point"][p].get("short", "")
    for a, row in LIB["aspect"].items():
        if "readAs" in row:
            yield f"aspect.{a}.readAsYou", row.get("readAsYou", "")
    yield "nextSteps.saturnReturn.practical", LIB["nextSteps"]["saturnReturn"].get("practical", "")


class LibraryV2(unittest.TestCase):
    def test_signs_have_life_fields(self):
        for s, row in LIB["sign"].items():
            for f in SIGN_FIELDS:
                self.assertTrue(isinstance(row.get(f), str) and row[f].strip(), f"sign.{s}.{f}")

    def test_houses_have_pulls(self):
        self.assertEqual(sorted(LIB["house"], key=int), [str(i) for i in range(1, 13)])
        for h, row in LIB["house"].items():
            self.assertTrue(row.get("pulls", "").strip(), f"house.{h}.pulls")

    def test_bodies_have_short(self):
        rows = [(p, LIB["planet"][p]) for p in LIB["planet"]] + [(p, LIB["point"][p]) for p in POINTS]
        for name, row in rows:
            short = row.get("short", "")
            self.assertTrue(1 <= len(short.split()) <= 4, f"{name}.short = {short!r}")
            self.assertTrue(short[:1].islower(), f"{name}.short must start lower case")

    def test_aspects_have_read_as_you(self):
        for a, row in LIB["aspect"].items():
            if "readAs" in row:
                t = row.get("readAsYou", "")
                self.assertIn("A", t.split()[0:1] + [w.strip(".,") for w in t.split()], a)
                self.assertIn("B", [w.strip(".,") for w in t.split()], a)
                self.assertIn(" you", t, a)

    def test_new_text_rules(self):
        for key, text in new_texts():
            self.assertTrue(text.strip(), f"{key} missing")
            self.assertLessEqual(len(text.split()), 22, key)
            self.assertNotRegex(text, r"[—–]", key)
            self.assertNotRegex(text, r"[“”‘’]", key)
            self.assertNotRegex(text, r"\bwill\b", key)
            low = text.lower()
            for b in validate.BANNED:
                self.assertNotIn(b, low, f"{key}: banned '{b}'")

    def test_core_fields_unchanged(self):
        self.assertEqual(LIB["sign"]["Libra"]["keywords"], "Fair · friendly · loves balance")
        self.assertEqual(LIB["house"]["9"]["detail"], "travel, study, big questions")
        self.assertEqual(LIB["aspect"]["sextile"]["readAs"], "A helps B when I make the effort.")


if __name__ == "__main__":
    unittest.main()
