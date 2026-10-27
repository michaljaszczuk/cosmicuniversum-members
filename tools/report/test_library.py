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
# Pairs that never form a square or opposition in a living person's chart.
TENSION_NEVER = {"Sun-Mercury", "Sun-Venus", "Mercury-Venus", "Neptune-Pluto"}
POINTS = ("Ascendant", "Midheaven", "Chiron", "NorthNode", "SouthNode")
# V3: the 24 runes in calendar order (same list as RUNES in birthsigns.mjs).
RUNES = ["Fehu", "Uruz", "Thurisaz", "Ansuz", "Raidho", "Kenaz", "Gebo", "Wunjo", "Hagalaz", "Nauthiz", "Isa",
         "Jera", "Eihwaz", "Perthro", "Algiz", "Sowilo", "Tiwaz", "Berkano", "Ehwaz", "Mannaz", "Laguz", "Ingwaz",
         "Othala", "Dagaz"]
LIFE_PATHS = [str(n) for n in range(1, 10)] + ["11", "22", "33"]
SIGN_V3 = ("love", "partner", "work", "workday", "step")
RITUAL = r"(?i)\b(spell|ritual|magic|activat|charm|summon|manifest)\w*"


def v3_texts():
    for s, row in LIB["sign"].items():
        for f in SIGN_V3:
            yield f"sign.{s}.{f}", row.get(f, "")
    for r in RUNES:
        row = LIB.get("rune", {}).get(r, {})
        for f in ("means", "gift", "shadow"):
            yield f"rune.{r}.{f}", row.get(f, "")
        for i, line in enumerate(row.get("practice", [""])):
            yield f"rune.{r}.practice[{i}]", line
    for n in LIFE_PATHS:
        row = LIB.get("lifePath", {}).get(n, {})
        for f in ("means", "gift", "shadow") + (("master",) if n in ("11", "22", "33") else ()):
            yield f"lifePath.{n}.{f}", row.get(f, "")


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
    for pair, rows in LIB.get("tension", {}).items():
        if not pair.startswith("_"):
            for i, ex in enumerate(rows):
                yield f"tension.{pair}[{i}]", ex
    yield "nextSteps.saturnReturn.practical", LIB["nextSteps"]["saturnReturn"].get("practical", "")
    yield from v3_texts()


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
            self.assertNotRegex(text, validate.SOURCE_WORDS, key)
            low = text.lower()
            for b in validate.BANNED:
                self.assertNotIn(b, low, f"{key}: banned '{b}'")

    def test_tension_pairs(self):
        planets = list(LIB["planet"])[:10]
        want = {f"{a}-{b}" for i, a in enumerate(planets) for b in planets[i + 1:]} - TENSION_NEVER
        have = {k for k in LIB["tension"] if not k.startswith("_")}
        self.assertEqual(have, want)
        for pair in want:
            self.assertEqual(len(LIB["tension"][pair]), 3, pair)
            for ex in LIB["tension"][pair]:
                self.assertTrue(ex.startswith(("You may", "Your ", "In love, you may", "What ")), f"{pair}: {ex}")

    def test_runes_complete(self):
        self.assertEqual(list(LIB["rune"]), ["_about"] + RUNES)
        for r in RUNES:
            row = LIB["rune"][r]
            self.assertEqual(len(row["glyph"]), 1, r)
            self.assertTrue(0x16A0 <= ord(row["glyph"]) <= 0x16FF, r)
            self.assertIn(len(row["practice"]), (2, 3), r)
            self.assertTrue(2 <= len(row["themes"]) <= 4, r)

    def test_life_paths_complete(self):
        self.assertEqual(list(LIB["lifePath"]), ["_about"] + LIFE_PATHS)
        for n in LIFE_PATHS:
            self.assertTrue(2 <= len(LIB["lifePath"][n]["themes"]) <= 4, n)
        for n, base in (("11", 2), ("22", 4), ("33", 6)):
            self.assertEqual(LIB["lifePath"][n]["base"], base)

    def test_signs_have_v3_fields(self):
        for s, row in LIB["sign"].items():
            self.assertTrue(2 <= len(row.get("themes", [])) <= 4, s)
            for f in SIGN_V3:
                self.assertTrue(row.get(f, "").strip(), f"sign.{s}.{f}")

    def test_themes_known_and_used(self):
        tags = {k for k in LIB["theme"] if not k.startswith("_")}
        groups = {"sign": [LIB["sign"][s]["themes"] for s in LIB["sign"]],
                  "rune": [LIB["rune"][r]["themes"] for r in RUNES],
                  "lifePath": [LIB["lifePath"][n]["themes"] for n in LIFE_PATHS]}
        for name, lists in groups.items():
            used = {t for ts in lists for t in ts}
            self.assertEqual(used - tags, set(), f"{name} uses unknown tags")
            self.assertEqual(tags - used, set(), f"{name} never uses these tags")

    def test_no_ritual_words(self):
        for key, text in v3_texts():
            self.assertNotRegex(text, RITUAL, key)

    def test_v3_drafts_marked(self):
        for sec in ("rune", "lifePath", "theme"):
            self.assertIn("DRAFT", LIB[sec]["_about"], sec)

    def test_core_fields_unchanged(self):
        self.assertEqual(LIB["sign"]["Libra"]["keywords"], "Fair · friendly · loves balance")
        self.assertEqual(LIB["house"]["9"]["detail"], "travel, study, big questions")
        self.assertEqual(LIB["aspect"]["sextile"]["readAs"], "A helps B when I make the effort.")


if __name__ == "__main__":
    unittest.main()
