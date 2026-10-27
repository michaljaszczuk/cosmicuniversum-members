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


class BuildV3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.facts = testkit.demo_facts()
        cls.text = pdf_text(cls.facts, testkit.minimal_content(cls.facts))

    def test_v3_sections_present(self):
        for s in ("What do I need in love?", "Who am I drawn to?", "What work suits me?",
                  "How do I like to work day to day?", "Your birth rune", "Berkano", "How to work with your rune",
                  "Your life path number", "Where they agree", "Try this week", "Nigel Pennick"):
            self.assertIn(s, self.text)

    def test_report_does_not_say_how_it_was_made(self):
        for s in ("Software computed", "An AI wrote", "checking program"):
            self.assertNotIn(s, self.text)
        self.assertIn("About this report", self.text)

    def test_three_pieces_read_as_sentences(self):
        self.assertIn("The planet shows what part of you it is about.", self.text)
        self.assertNotIn("The planet is what part of you", self.text)

    def test_patterns_page_removed(self):
        self.assertNotIn("Patterns in your chart", self.text)

    def test_rune_edge_line(self):
        self.assertIn("Some give you Tiwaz", self.text)
        facts = copy.deepcopy(self.facts)
        facts["birthRune"]["edge"] = None
        self.assertNotIn("Some give you", pdf_text(facts, testkit.minimal_content(facts)))

    def test_life_path_steps_printed(self):
        for s in ("Month: 3", "Day: 14 → 5", "Year: 1990 → 19 → 10 → 1", "3 + 5 + 1 = 9"):
            self.assertIn(s, self.text)

    def test_master_number_line(self):
        facts = copy.deepcopy(self.facts)
        facts["lifePath"] = {"number": 22, "steps": {"month": 11, "day": 9, "year": 2}, "sum": 22,
                             "method": "reduce-parts"}
        self.assertIn(report_text.LIB["lifePath"]["22"]["master"], pdf_text(facts, testkit.minimal_content(facts)))

    def test_agree_rows_printed(self):
        self.assertIn(report_text.LIB["theme"]["giving"], self.text)

    def test_agree_empty_line(self):
        facts = copy.deepcopy(self.facts)
        facts["agree"] = []
        self.assertIn("Your Sun, your rune and your number each show a different side of you.",
                      pdf_text(facts, testkit.minimal_content(facts)))

    def test_same_sign_step_once(self):
        facts = copy.deepcopy(self.facts)
        facts["items"]["moon.sign"] = facts["items"]["sun.sign"]
        facts["items"]["bigThree.moon"] = facts["items"]["sun.sign"]
        step = " ".join(report_text.LIB["sign"][facts["items"]["sun.sign"]]["step"].split())
        self.assertEqual(pdf_text(facts, testkit.minimal_content(facts)).count(step), 1)

    def pages(self, facts):
        with tempfile.TemporaryDirectory() as tmp:
            out = str(Path(tmp) / "r.pdf")
            build_report.build(facts, testkit.minimal_content(facts), out)
            return [" ".join(p.extract_text().split()) for p in PdfReader(out).pages]

    def test_new_chapters_need_no_new_page(self):
        # Love, rune and number start on the same page when there is room (no half-empty pages).
        brk = build_report.chapter_break()[0]
        self.assertIsInstance(brk, build_report.CondPageBreak)
        self.assertLessEqual(brk.height, 100 * build_report.mm)

    def test_rune_and_number_heads_stay_together(self):
        # Push the rune and number chapters down step by step: their head blocks never split.
        for n in range(1, 24, 2):
            content = testkit.minimal_content(self.facts)
            for s in content["sections"]:
                if s["id"] in ("work.daily", "rune"):
                    s["sentences"] = [{"text": f"Line {i} for the test.", "src": []} for i in range(n)]
            with tempfile.TemporaryDirectory() as tmp:
                out = str(Path(tmp) / "r.pdf")
                build_report.build(self.facts, content, out)
                pages = [" ".join(p.extract_text().split()) for p in PdfReader(out).pages]
            rune = next(p for p in pages if "Your birth rune" in p)
            self.assertIn("Its shadow", rune, n)
            num = next(p for p in pages if "Your life path number" in p)
            self.assertIn("3 + 5 + 1 = 9", num, n)

    def test_rune_glyph_font(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = str(Path(tmp) / "r.pdf")
            build_report.build(self.facts, testkit.minimal_content(self.facts), out)
            fonts = set()
            for page in PdfReader(out).pages:
                for f in (page.get("/Resources", {}).get("/Font", {}) or {}).values():
                    fonts.add(str(f.get_object().get("/BaseFont")))
        self.assertTrue(any("NotoSansRunic" in f for f in fonts), fonts)


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
