"""Fixed report text made by code from facts.json and library.json (no AI)."""
import json
import re
from pathlib import Path

LIB = json.loads((Path(__file__).parent / "library.json").read_text(encoding="utf-8"))

ORD = lambda n: f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"  # noqa: E731

# facts.items key prefix -> name printed in the report
ITEM_NAME = {"sun": "Sun", "moon": "Moon", "mercury": "Mercury", "venus": "Venus", "mars": "Mars",
             "jupiter": "Jupiter", "saturn": "Saturn", "uranus": "Uranus", "neptune": "Neptune", "pluto": "Pluto",
             "chiron": "Chiron", "northNode": "North Node", "southNode": "South Node", "lilith": "Lilith",
             "partOfFortune": "Part of Fortune", "vertex": "Vertex"}


def short_word(body):
    key = body.replace(" ", "")
    for sec in ("planet", "point"):
        if key in LIB[sec]:
            return LIB[sec][key].get("short", "")
    return ""


def _with_word(body):
    w = short_word(body)
    return f"{body} ({w})" if w else body


def fill_aspect(a, typ, b):
    """The aspect's 'read it as' line with the two planets and their short words filled in."""
    row = LIB["aspect"][typ.lower()]
    if "readAsYou" in row:
        text = re.sub(r"\bA\b", lambda _: _with_word(a), row["readAsYou"], count=1)
        return re.sub(r"\bB\b", lambda _: _with_word(b), text, count=1)
    return f"{_with_word(a)} and {_with_word(b)}: {row['keyword'][0].lower()}{row['keyword'][1:]}."


def _pattern_name(p):
    if p["type"] == "stellium":
        return f"Stellium in {p['sign']}"
    return p["type"].replace("-", " ").title().replace("T Square", "T-square")


def reason_line(src, facts):
    """'Moon in Pisces, 2nd house · Moon square Neptune': the chart facts a section cites."""
    items, parts, seen = facts["items"], [], {}
    for ref in src:
        kind, _, path = ref.partition(":")
        if kind != "fact":
            continue
        text = None
        m = re.fullmatch(r"items\.(\w+)\.(sign|house)", path)
        if m and m.group(1) in ITEM_NAME and path[6:] in items:
            body = ITEM_NAME[m.group(1)]
            sign, house = items.get(f"{m.group(1)}.sign"), items.get(f"{m.group(1)}.house")
            has = seen.setdefault(body, set())
            has.add(m.group(2))
            text = f"{body} in " + ", ".join(
                x for x in ((sign if "sign" in has else None),
                            (f"{ORD(int(house))} house" if "house" in has and house else None)) if x)
            idx = next((i for i, p in enumerate(parts) if p.startswith(f"{body} in ")), None)
            if idx is not None:
                parts[idx] = text
                continue
        elif m := re.fullmatch(r"aspects\[(\d+)\]", path):
            if int(m.group(1)) < len(facts["aspects"]):
                a = facts["aspects"][int(m.group(1))]
                text = f"{a['a']} {a['type']} {a['b']}"
        elif m := re.fullmatch(r"patterns\[(\d+)\]", path):
            if int(m.group(1)) < len(facts["patterns"]):
                text = _pattern_name(facts["patterns"][int(m.group(1))])
        elif m := re.fullmatch(r"items\.balance\.(\w+)", path):
            if path[6:] in items:
                text = f"{items[path[6:]]} {m.group(1)}"
        elif path == "chartRuler":
            text = f"Chart ruler {facts['chartRuler']['traditional']}"
        elif path == "items.bigThree.rising":
            text = f"Rising in {items['bigThree.rising']}"
        if text and text not in parts:
            parts.append(text)
    return " · ".join(parts)


def RULER_STEPS(rising, ruler, sign, house):  # noqa: N802 (fixed copy, named like a constant)
    return ["Every sign has a ruling planet. Think of it as the boss of that sign.",
            f"Your Rising sign is {rising}. Its boss is {ruler}.",
            f"So {ruler} is the boss of your whole chart.",
            f"{ruler} sits in {sign}, in your {ORD(int(house))} house. That is where your energy goes first."]
