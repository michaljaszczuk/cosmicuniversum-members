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
        self.section("why.approach")["sentences"] = [
            {"text": "Your Rising sign is Leo.", "src": ["fact:items.bigThree.rising", "lib:sign.Leo.keywords"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_repeat_across_sections_fails(self):
        self.section("why.who")["sentences"] = [
            {"text": "You are fair and friendly, and you love balance.", "src": ["fact:items.sun.sign"]}]
        self.section("planet.Mercury")["sentences"] = [
            {"text": "Mercury makes you fair and friendly, and you love balance too.", "src": ["fact:items.sun.sign"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_repeats_finds_the_pair(self):
        content = {"sections": [
            {"id": "a", "sentences": [{"text": "You love music, art and calm time alone.", "src": []}]},
            {"id": "b", "sentences": [{"text": "Calm time alone with music and art helps.", "src": []},
                                      {"text": "You love music, art and calm time alone.", "src": []}]}]}
        found = validate.repeats(content)
        self.assertEqual(len(found), 1)
        self.assertIn("b#2", found[0])
        self.assertIn("a#1", found[0])

    def test_question_prefix_is_not_a_repeat(self):
        content = {"sections": [{"id": "a", "sentences": [
            {"text": "A question to keep: where do I hold back?", "src": []},
            {"text": "A question to keep: what do I need?", "src": []}]}]}
        self.assertEqual(validate.repeats(content), [])

    def test_v3_sections_required(self):
        for sid in ("love.needs", "love.draws", "work.suits", "work.daily", "rune", "lifePath", "agree"):
            content = testkit.minimal_content(self.facts)
            content["sections"] = [s for s in content["sections"] if s["id"] != sid]
            self.assertEqual(self.run_on(content), 1, sid)

    def test_love_needs_must_cite_fact(self):
        self.section("love.needs")["sentences"] = [
            {"text": "You need steady love.", "src": ["lib:sign.Taurus.love"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_wrong_rune_named(self):
        self.section("rune")["sentences"] = [{"text": "Your rune is Wunjo.", "src": ["fact:birthRune"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_right_rune_named(self):
        self.section("rune")["sentences"] = [{"text": "Your rune is Berkano.", "src": ["fact:birthRune"]}]
        self.assertEqual(self.run_on(self.content), 0)

    def test_wrong_life_path_number(self):
        self.section("lifePath")["sentences"] = [
            {"text": "Your life path number is 7.", "src": ["fact:lifePath"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_right_life_path_number(self):
        self.section("lifePath")["sentences"] = [
            {"text": "Your life path number is 9.", "src": ["fact:lifePath"]}]
        self.assertEqual(self.run_on(self.content), 0)

    def test_agree_theme_not_shared(self):
        # demo facts share only 'giving'; 'joy and fun' is a theme label they do not share
        self.section("agree")["sentences"] = [
            {"text": "All three point to joy and fun.", "src": ["fact:agree", "lib:theme.joy"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_agree_shared_theme_passes(self):
        self.section("agree")["sentences"] = [
            {"text": "Two of them point to giving and helping others.", "src": ["fact:agree", "lib:theme.giving"]}]
        self.assertEqual(self.run_on(self.content), 0)

    def test_agree_empty_without_theme_passes(self):
        self.facts["agree"] = []
        self.section("agree")["sentences"] = [
            {"text": "Each one shows a different side of you.", "src": ["fact:agree"]}]
        self.assertEqual(self.run_on(self.content), 0)

    def test_agree_empty_with_theme_fails(self):
        self.facts["agree"] = []
        self.section("agree")["sentences"] = [
            {"text": "All three point to giving and helping others.", "src": ["fact:agree", "lib:theme.giving"]}]
        self.assertEqual(self.run_on(self.content), 1)

    def test_no_pattern_sections_needed(self):
        self.assertFalse(any(s["id"].startswith("pattern.") for s in self.content["sections"]))


if __name__ == "__main__":
    unittest.main()
