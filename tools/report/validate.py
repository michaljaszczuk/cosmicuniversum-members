"""Check report content against the chart facts and the meaning library.

Run: py tools/report/validate.py <facts.json> <content.json>
Exit 1 on any error. No AI here: every check is a plain rule.
"""
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

LIB = json.loads((Path(__file__).parent / "library.json").read_text(encoding="utf-8"))

BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune",
          "Pluto", "Chiron", "North Node", "South Node", "Lilith", "Part of Fortune", "Vertex",
          "Midheaven", "Ascendant"]
SIGNS = list(LIB["sign"])
ASPECTS = list(LIB["aspect"])
PATTERNS = ["stellium", "T-square", "grand trine", "grand cross", "yod", "kite"]
ELEMENTS = ["fire", "earth", "air", "water"]
MODES = ["cardinal", "fixed", "mutable"]
PHASES = [k for k in LIB["moonPhase"] if not k.startswith("_") and k not in ("New", "Full")]
RUNES = [k for k in LIB["rune"] if not k.startswith("_")]
THEMES = {k: v for k, v in LIB["theme"].items() if not k.startswith("_")}
BANNED = ["delve", "crucial", "pivotal", "tapestry", "testament", "vibrant", "journey", "unlock",
          "empower", "profound", "essence", "embrace", "landscape", "realm", "navigate",
          "cosmic dance", "energy field", "the universe", "destiny", "fate will", "additionally",
          "showcase", "underscore", "foster", "key ", "quietly", "enduring", "intricate"]
# The paid report never names the free ebook (whole words, so "notebook" is fine).
SOURCE_WORDS = re.compile(r"\b(e-?book|workbook|read your own chart)\b", re.I)
FUTURE = re.compile(r"\byou will\b|\bwill (happen|come|meet|find|get|be)\b", re.I)
HEALTH = re.compile(r"\b(doctor|disease|illness|medic\w*|diet|invest\w*|lawyer)\b", re.I)
WHY = ["why.who", "why.drives", "why.likes", "why.dislikes", "why.drains", "why.needs", "why.approach"]
LOVE_WORK = ["love.needs", "love.draws", "work.suits", "work.daily"]
# Answers to a reader's question: every sentence must cite the chart.
ANSWERS = WHY + LOVE_WORK
REQUIRED = ["intro", "chartRuler", *ANSWERS, "rune", "lifePath", "agree", "balance", "moonPhase", "retrograde",
            "aspect.1", "aspect.2", "aspect.3"]
# Words that do not count when two sentences are compared for repeats.
STOP = set("a an the and or but so to of in on at for with by from is are be you your it its this that as can "
           "may also often when what who how where which do does not no very".split())
FACT_KEY = {"North Node": "northNode", "South Node": "southNode", "Lilith": "lilith",
            "Part of Fortune": "partOfFortune", "Vertex": "vertex"}


def get_path(root, path):
    """Resolve 'a.b[2].c'. Keys in facts.items contain dots, so try the longest key first."""
    if path.startswith("items.") and path[6:] in root["items"]:
        return root["items"][path[6:]]
    cur = root
    for part in re.findall(r"[^.\[\]]+|\[\d+\]", path):
        if part.startswith("["):
            cur = cur[int(part[1:-1])]
        elif isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            raise KeyError(path)
    return cur


def syllables(word):
    w = word.lower().strip(".,:;!?()'\"")
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(1, n)


def fk_grade(text):
    sents = [s for s in re.split(r"[.!?]+\s", text) if s.strip()]
    words = re.findall(r"[A-Za-z']+", text)
    syl = sum(syllables(w) for w in words)
    return 0.39 * len(words) / len(sents) + 11.8 * syl / len(words) - 15.59


def repeats(content, n=4):
    """Sentences that share n content words in a row with an earlier sentence ('b#2 repeats a#1: ...')."""
    seen, out = {}, []
    for sec in content["sections"]:
        for i, s in enumerate(sec["sentences"], 1):
            where = f"{sec['id']}#{i}"
            text = re.sub(r"^A question to keep:", "", s["text"])
            words = [w for w in re.findall(r"[a-z0-9']+", text.lower()) if w not in STOP]
            hit = None
            for k in range(len(words) - n + 1):
                gram = tuple(words[k:k + n])
                if hit is None and gram in seen and seen[gram] != where:
                    hit = (seen[gram], gram)
                seen.setdefault(gram, where)
            if hit:
                out.append(f"{where} repeats {hit[0]}: '{' '.join(hit[1])}'")
    return out


@dataclass
class Result:
    errors: list  # "<section id>#<n>: ..." for one sentence, plain text for the whole report
    warns: list
    grade: float
    sentences: int


def check(facts, content):
    """All rules on one report. No printing; main() and the shop worker both use this."""
    errors, warns = [], []
    all_text = []
    ids = {s["id"] for s in content["sections"]}
    for r in REQUIRED:
        if r not in ids:
            errors.append(f"missing section {r}")

    for sec in content["sections"]:
        for i, s in enumerate(sec["sentences"], 1):
            where = f"{sec['id']}#{i}"
            text, src = s["text"], s.get("src", [])
            all_text.append(text)
            if not src:
                errors.append(f"{where}: no src")
            if sec["id"] in ANSWERS and not any(r.startswith("fact:") for r in src):
                errors.append(f"{where}: an answer must cite the chart (fact:)")
            blob = []
            for ref in src:
                kind, _, path = ref.partition(":")
                try:
                    if kind == "fact":
                        val = get_path(facts, path)
                    elif kind == "lib":
                        val = get_path(LIB, path)
                    elif kind == "meta":
                        if sec["id"] not in ("intro", "future"):
                            errors.append(f"{where}: meta source outside intro")
                        val = ""
                    else:
                        raise KeyError(ref)
                except (KeyError, IndexError, TypeError):
                    errors.append(f"{where}: source not found: {ref}")
                    continue
                blob.append(path + " " + json.dumps(val, ensure_ascii=False))
            blob = " ".join(blob).lower()

            # 1. every named thing must be in the cited sources
            scan = text.replace("Black Moon Lilith", "Lilith")
            for name in BODIES + SIGNS + ASPECTS + PATTERNS + ELEMENTS + MODES + PHASES + RUNES:
                if re.search(rf"\b{re.escape(name)}\b", scan, re.I):
                    key = name.lower().replace(" ", "")
                    if name.lower() not in blob and key not in blob.replace(" ", ""):
                        errors.append(f"{where}: '{name}' is not in the cited sources")
            for m in re.finditer(r"\b(\d+)(?:st|nd|rd|th) house\b|\bhouse (\d+)\b", text):
                n = m.group(1) or m.group(2)
                if not re.search(rf"(house\.{n}\b|\"{n}\"|\b{n}\b)", blob):
                    errors.append(f"{where}: house {n} is not in the cited sources")
            for m in re.finditer(r"(\d+(?:\.\d)?)°", text):
                d = float(m.group(1))
                nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", blob)]
                if not any(abs(d - x) < 0.05 or (d == int(d) and int(x) == d) for x in nums):
                    errors.append(f"{where}: {m.group(0)} is not in the cited sources")

            # 2. "X is in Sign, in your Nth house" must match the chart
            for m in re.finditer(r"\b(" + "|".join(BODIES) + r") is in (" + "|".join(SIGNS) +
                                 r")(?:, in (?:your|the) (\d+)(?:st|nd|rd|th) house)?", text):
                body, sign, house = m.groups()
                key = FACT_KEY.get(body, body.lower())
                if body == "Midheaven":
                    real_sign, real_house = facts["midheaven"].split()[-1], None
                else:
                    real_sign = facts["items"].get(f"{key}.sign")
                    real_house = facts["items"].get(f"{key}.house")
                if sign != real_sign:
                    errors.append(f"{where}: {body} is in {real_sign}, not {sign}")
                if house and real_house and house != real_house:
                    errors.append(f"{where}: {body} is in house {real_house}, not {house}")
            # A rune or a life path number must be the chart's own, whatever the sentence cites.
            own = {facts["birthRune"]["rune"], *(facts["birthRune"]["edge"] or {}).get("other", [])}
            for rune in RUNES:
                if rune not in own and re.search(rf"\b{rune}\b", text):
                    errors.append(f"{where}: the birth rune is {facts['birthRune']['rune']}, not {rune}")
            for m in re.finditer(r"\b(?:life path(?: number)?|number)(?: is| of)? (\d+)\b", text, re.I):
                if int(m.group(1)) != facts["lifePath"]["number"]:
                    errors.append(f"{where}: life path is {facts['lifePath']['number']}, not {m.group(1)}")
            # A theme counts as named when the sentence cites it, uses its label, or says
            # "point to / share / agree on <tag>". Plain words like "care" or "change" are fine.
            if sec["id"] == "agree":
                shared = {a["theme"] for a in facts["agree"]}
                for tag, label in THEMES.items():
                    if tag in shared:
                        continue
                    if (f"lib:theme.{tag}" in src or label in text.lower() or
                            re.search(rf"\b(?:points? to|shares?|agrees? on|theme of) {tag}\b", text, re.I)):
                        errors.append(f"{where}: theme '{tag}' is not shared (fact:agree)")
            m = re.search(r"Rising sign is (" + "|".join(SIGNS) + r")\b", text)
            if m and m.group(1) != facts["items"]["bigThree.rising"]:
                errors.append(f"{where}: Rising is {facts['items']['bigThree.rising']}")

            # 3. style rules
            n_words = len(re.findall(r"\S+", text))
            if n_words > 22:
                errors.append(f"{where}: {n_words} words (max 22)")
            if re.search(r"[—–]", text):
                errors.append(f"{where}: em or en dash")
            if re.search(r"[“”‘’]", text):
                errors.append(f"{where}: curly quotes")
            low = text.lower()
            for b in BANNED:
                if b in low:
                    errors.append(f"{where}: banned word '{b.strip()}'")
            if m := SOURCE_WORDS.search(text):
                errors.append(f"{where}: banned word '{m.group(0).lower()}'")
            if FUTURE.search(text):
                errors.append(f"{where}: prediction ('will')")
            if HEALTH.search(text):
                errors.append(f"{where}: health/money/legal word")

    # 4. say each thing once in the whole report
    errors += repeats(content)
    warns += [w for w in repeats(content, 3) if w.split(" repeats")[0] not in " ".join(errors)]

    grade = fk_grade(" ".join(all_text))
    if grade > 8.0:
        errors.append(f"reading grade {grade:.1f} (max 8.0)")
    n = sum(len(s["sentences"]) for s in content["sections"])
    return Result(errors, warns, grade, n)


def main(facts_path, content_path):
    facts = json.loads(Path(facts_path).read_text(encoding="utf-8"))
    content = json.loads(Path(content_path).read_text(encoding="utf-8"))
    r = check(facts, content)
    errors, warns = r.errors, r.warns
    ids = {s["id"] for s in content["sections"]}
    print(f"sentences: {r.sentences}, sections: {len(ids)}, reading grade (Flesch-Kincaid): {r.grade:.1f}")
    for w in warns:
        print("WARN", w)
    for e in errors:
        print("ERROR", e)
    print("RESULT:", "PASS" if not errors else f"FAIL ({len(errors)} errors)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
