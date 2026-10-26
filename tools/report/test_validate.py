"""Tests for tools/report/validate.py (V2 rules).

    py -m pytest tools/report/test_validate.py -q
"""
import tempfile
import unittest

import testkit
import validate


class ValidateV2(unittest.TestCase):
    def run_on(self, content):
        with tempfile.TemporaryDirectory() as tmp:
            f = testkit.write(tmp, "facts.json", self.facts)
            c = testkit.write(tmp, "content.json", content)
            return validate.main(f, c)

    def setUp(self):
        self.facts = testkit.demo_facts()
        self.content = testkit.minimal_content(self.facts)

    def section(self, sid):
        return next(s for s in self.content["sections"] if s["id"] == sid)

    def test_minimal_content_passes(self):
        self.assertEqual(self.run_on(self.content), 0)

    def test_missing_why_section_fails(self):
        self.content["sections"] = [s for s in self.content["sections"] if s["id"] != "why.drains"]
        self.assertEqual(self.run_on(self.content), 1)

    def test_why_sentence_without_fact_fails(self):
        self.section("why.likes")["sentences"] = [
            {"text": "You like kind people and calm talks.", "src": ["lib:sign.Libra.likes"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_ebook_word_fails(self):
        self.section("intro")["sentences"].append(
            {"text": "The meanings come from the workbook.", "src": ["meta:intro"]})
        self.assertEqual(self.run_on(self.content), 1)

    def test_notebook_is_allowed(self):
        self.section("intro")["sentences"].append(
            {"text": "You could keep a notebook by your bed.", "src": ["meta:intro"]})
        self.assertEqual(self.run_on(self.content), 0)

    def test_wrong_rising_sign_fails(self):
        self.section("bigThree.rising")["sentences"] = [
            {"text": "Your Rising sign is Leo.", "src": ["fact:items.bigThree.rising", "lib:sign.Leo.keywords"]}]
        self.assertEqual(self.run_on(self.content), 1)


if __name__ == "__main__":
    unittest.main()
