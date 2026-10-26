"""Tests for tools/report/report_text.py.

    py -m pytest tools/report/test_report_text.py -q
"""
import unittest

import testkit
from report_text import ORD, RULER_STEPS, fill_aspect, reason_line, short_word, tension_examples


class ReportText(unittest.TestCase):
    def setUp(self):
        self.demo = testkit.demo_facts()

    def test_short_word(self):
        self.assertEqual(short_word("Sun"), "who you are")
        self.assertEqual(short_word("North Node"), "where you grow")
        self.assertEqual(short_word("Xyz"), "")

    def test_tension_examples_any_order(self):
        ex = tension_examples("Neptune", "Moon")
        self.assertEqual(len(ex), 3)
        self.assertEqual(ex, tension_examples("Moon", "Neptune"))
        self.assertEqual(tension_examples("Sun", "Mercury"), [])
        self.assertEqual(tension_examples("Moon", "Chiron"), [])

    def test_fill_aspect(self):
        self.assertEqual(fill_aspect("Sun", "sextile", "Mars"),
                         "Sun (who you are) helps Mars (your energy) when you make the effort.")

    def test_fill_aspect_every_major_type(self):
        self.assertEqual(fill_aspect("Moon", "square", "Neptune"),
                         "Moon (your feelings) pushes against Neptune (your dreams), and that pushes you to act.")
        self.assertEqual(fill_aspect("Sun", "conjunction", "Mercury"),
                         "In you, Sun (who you are) and Mercury (how you think) act as one.")
        self.assertTrue(fill_aspect("Moon", "opposition", "Venus").startswith(
            "Moon (your feelings) and Venus (what you love) pull you in opposite ways."))

    def test_fill_aspect_unknown_body(self):
        self.assertTrue(fill_aspect("Sun", "sextile", "Xyz").endswith("helps Xyz when you make the effort."))

    def test_fill_aspect_minor_falls_back_to_keyword(self):
        self.assertEqual(fill_aspect("Mars", "semi-square", "Saturn"),
                         "Mars (your energy) and Saturn (your hard work): a small irritation that keeps nagging.")

    def test_reason_line_joins_sign_and_house(self):
        house = ORD(int(self.demo["items"]["sun.house"]))
        line = reason_line(["fact:items.sun.sign", "fact:items.sun.house", "lib:sign.Pisces.gift", "fact:nope"],
                           self.demo)
        self.assertEqual(line, f"Sun in Pisces, {house} house")

    def test_reason_line_aspect_pattern_ruler(self):
        line = reason_line(["fact:aspects[0]", "fact:patterns[0]", "fact:chartRuler", "fact:items.balance.air",
                            "fact:items.bigThree.rising", "fact:aspects[0]"], self.demo)
        self.assertEqual(line, "Mars conjunction Midheaven · Stellium in Capricorn · Chart ruler Mercury"
                               " · 4 air · Rising in Gemini")

    def test_reason_line_skips_the_block_body(self):
        line = reason_line(["fact:items.sun.sign", "fact:aspects[0]"], self.demo, skip=("Sun in",))
        self.assertNotIn("Sun in", line)
        self.assertTrue(line)
        self.assertEqual(reason_line(["fact:items.sun.sign"], self.demo, skip=("Sun in",)), "")

    def test_reason_line_empty(self):
        self.assertEqual(reason_line(["lib:x", "meta:intro"], self.demo), "")

    def test_ruler_steps(self):
        steps = RULER_STEPS("Gemini", "Mercury", "Pisces", 10)
        self.assertEqual(len(steps), 4)
        self.assertEqual(steps[1], "Your Rising sign is Gemini. Its boss is Mercury.")
        self.assertEqual(steps[3], "Mercury sits in Pisces, in your 10th house. That is where your energy goes first.")


if __name__ == "__main__":
    unittest.main()
