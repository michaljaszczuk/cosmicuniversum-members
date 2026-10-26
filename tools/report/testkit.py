"""Test helpers for the report tools. Uses only made-up demo data (the repo is public)."""
import json
from pathlib import Path

HERE = Path(__file__).parent
DEMO_FACTS = HERE / "samples" / "demo-facts.json"

WHY = ["why.who", "why.drives", "why.likes", "why.dislikes", "why.drains", "why.needs", "why.approach"]
SECTIONS = (["intro", "bigThree.sun", "bigThree.moon", "bigThree.rising", "chartRuler"] + WHY +
            [f"planet.{p}" for p in ("Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune",
                                     "Pluto", "Chiron")] +
            [f"point.{p}" for p in ("NorthNode", "SouthNode", "Lilith", "Fortune", "Vertex", "Midheaven")] +
            ["balance", "moonPhase", "retrograde", "angles", "aspect.1", "aspect.2", "aspect.3", "clash",
             "saturnReturn", "story"])


def demo_facts():
    return json.loads(DEMO_FACTS.read_text(encoding="utf-8"))


def minimal_content(facts):
    """One safe, cited sentence per section, plus one per pattern."""
    sentence = {"text": f"Your Sun is in {facts['items']['sun.sign']}.", "src": ["fact:items.sun.sign"]}
    ids = SECTIONS + [f"pattern.{i}" for i in range(1, len(facts["patterns"]) + 1)]
    return {"sections": [{"id": i, "sentences": [dict(sentence)]} for i in ids], "not_covered": []}


def write(tmp, name, data):
    p = Path(tmp) / name
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return str(p)
