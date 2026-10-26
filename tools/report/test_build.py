"""Tests for the V2 PDF layout in tools/report/build_report.py (demo data only).

    py -m pytest tools/report/test_build.py -q
"""
import copy
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader

import build_report
import report_text
import testkit


def pdf_text(facts, content):
    with tempfile.TemporaryDirectory() as tmp:
        out = str(Path(tmp) / "r.pdf")
        build_report.build(facts, content, out)
        text = "\n".join(p.extract_text() for p in PdfReader(out).pages)
    return " ".join(text.split())


class BuildV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.facts = testkit.demo_facts()
        cls.text = pdf_text(cls.facts, testkit.minimal_content(cls.facts))

    def test_v2_sections_present(self):
        for s in ("Your Big Three", "Who you are, and the person you are growing into",
                  "Your feelings, and what makes you feel safe",
                  "Your approach to life, and how others first see you", "Who am I?", "What drives me?",
                  "What makes me feel bad?", "What do I not like?", "Saturn return 1:",
                  "is the boss of your whole chart"):
            self.assertIn(s, self.text)

    def test_v1_parts_removed(self):
        for s in ("What to try next", "Progressions", "Read Your Own Chart", "Read 'A' and 'B'", "workbook",
                  "Why you are like this", "Your chart story", "Example strip"):
            self.assertNotIn(s, self.text)

    def test_aspect_rows_filled(self):
        self.assertIn("Mars (your energy)", self.text)

    def test_red_lines_box(self):
        self.assertIn("Where you pull two ways", self.text)

    def test_red_lines_have_examples(self):
        self.assertIn("In real life, this can look like:", self.text)
        for ex in report_text.tension_examples("Moon", "Saturn"):
            self.assertIn(ex, self.text)

    def test_many_red_lines_fit(self):
        facts = copy.deepcopy(self.facts)
        reds = [a for a in facts["aspects"] if a["type"] in ("square", "opposition")]
        facts["aspects"] += reds * 4
        self.assertIn("Where you pull two ways", pdf_text(facts, testkit.minimal_content(facts)))

    def test_no_red_lines_no_box(self):
        facts = copy.deepcopy(self.facts)
        facts["aspects"] = [a for a in facts["aspects"] if a["type"] not in ("square", "opposition")]
        text = pdf_text(facts, testkit.minimal_content(facts))
        self.assertNotIn("Where you pull two ways", text)

    def test_no_saturn_returns(self):
        facts = copy.deepcopy(self.facts)
        facts["saturnReturns"] = []
        self.assertNotIn("Saturn return 1:", pdf_text(facts, testkit.minimal_content(facts)))


class Layout(unittest.TestCase):
    def test_body_font_is_13(self):
        self.assertEqual(build_report.S["body"].fontSize, 13)
        self.assertAlmostEqual(build_report.S["small"].fontSize, 9.5 * 13 / 12, delta=0.1)
        self.assertAlmostEqual(build_report.S["h1"].fontSize, 24 * 13 / 12, delta=0.1)

    def test_headings_keep_with_next(self):
        for k in ("h1", "h2", "h3", "sub", "kicker"):
            self.assertEqual(build_report.S[k].keepWithNext, 1, k)

    def test_heading_never_ends_a_page(self):
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        with tempfile.TemporaryDirectory() as tmp:
            out = str(Path(tmp) / "h.pdf")
            doc = SimpleDocTemplate(out, pagesize=A4)
            story = [Spacer(1, doc.height - 52), Paragraph("Lonely heading", build_report.S["h1"]),
                     Paragraph("Body text " * 60, build_report.S["body"])]
            doc.build(story)
            pages = [p.extract_text() for p in PdfReader(out).pages]
        self.assertNotIn("Lonely heading", pages[0])
        self.assertIn("Lonely heading", pages[1])


    def test_heading_before_a_block_moves_with_it(self):
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer
        with tempfile.TemporaryDirectory() as tmp:
            out = str(Path(tmp) / "k.pdf")
            doc = SimpleDocTemplate(out, pagesize=A4)
            block = KeepTogether([Paragraph("Block text " * 80, build_report.S["body"])])
            story = [Spacer(1, doc.height - 120), Paragraph("Heading over a block", build_report.S["h2"]), block]
            doc.build(build_report.keep_heads(story))
            pages = [p.extract_text() for p in PdfReader(out).pages]
        self.assertNotIn("Heading over a block", pages[0])


class ParaOrder(unittest.TestCase):
    def test_question_keeps_its_place(self):
        content = {"sections": [{"id": "x", "sentences": [
            {"text": "First.", "src": []}, {"text": "A question to keep: why?", "src": []},
            {"text": "Last.", "src": []}]}]}
        out = build_report.Report(testkit.demo_facts(), content).para("x")
        texts = [p.getPlainText() for p in out]
        self.assertEqual(texts, ["First.", "Ask yourself: why?", "Last."])


if __name__ == "__main__":
    unittest.main()
