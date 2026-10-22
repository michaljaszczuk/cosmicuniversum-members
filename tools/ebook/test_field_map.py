"""Tests for tools/ebook/field-map.json against the v2 digital PDF.

    python -m unittest tools/ebook/test_field_map.py      (or: python tools/ebook/test_field_map.py)

Needs the v2 PDFs built by build_v2.py in private-files/v2/ (git-ignored).
Without them the PDF tests are skipped and say so.
"""
from __future__ import annotations

import json
import os
import re
import unittest
from collections import Counter

from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MAP_PATH = os.path.join(HERE, "field-map.json")
V2 = os.path.join(REPO, "private-files", "v2")
DIGITAL = os.path.join(V2, "Read-Your-Own-Chart_cosmic_universum_DIGITAL_v2.pdf")
TEMPLATE = os.path.join(V2, "pages-16-18-edit.pdf")
PAGES = {"page16": 16, "page17": 17, "page18": 18}


def load_map():
    with open(MAP_PATH, encoding="utf-8") as f:
        return json.load(f)


def widgets_by_page(path):
    """{page number (1-based): [field names]} for every text widget."""
    r = PdfReader(path)
    out = {}
    for i, p in enumerate(r.pages):
        for a in p.get("/Annots", []) or []:
            a = a.get_object()
            if a.get("/Subtype") == "/Widget":
                name = a.get("/T")
                if name is None and "/Parent" in a:
                    name = a["/Parent"].get_object().get("/T")
                out.setdefault(i + 1, []).append(str(name))
    return out


class FieldMapShape(unittest.TestCase):
    def test_map_has_the_three_pages(self):
        m = load_map()
        for key in PAGES:
            self.assertIn(key, m)
            self.assertTrue(m[key], key)

    def test_field_names_match_their_page_prefix(self):
        m = load_map()
        for key, num in PAGES.items():
            for item, name in m[key].items():
                self.assertRegex(name, rf"^p{num}_(line|multi|cell|box)_\d+$", f"{key}.{item}")

    def test_writing_only_items_exist_in_the_map(self):
        m = load_map()
        for key, items in m["_meta"]["writingOnly"].items():
            for item in items:
                self.assertIn(item, m[key], f"{key}.{item}")

    def test_no_field_mapped_twice(self):
        m = load_map()
        names = [n for key in PAGES for n in m[key].values()]
        dupes = [n for n, c in Counter(names).items() if c > 1]
        self.assertEqual(dupes, [])


@unittest.skipUnless(os.path.exists(DIGITAL), "v2 digital PDF not built (run python tools/ebook/build_v2.py)")
class FieldMapAgainstPdf(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.map = load_map()
        cls.by_page = widgets_by_page(DIGITAL)

    def test_every_mapped_field_exists_on_its_page(self):
        for key, num in PAGES.items():
            on_page = set(self.by_page.get(num, []))
            for item, name in self.map[key].items():
                self.assertIn(name, on_page, f"{key}.{item} -> {name} not on page {num}")

    def test_every_field_on_pages_16_to_18_is_mapped_or_writing_only(self):
        for key, num in PAGES.items():
            mapped = set(self.map[key].values())
            for name in self.by_page.get(num, []):
                self.assertIn(name, mapped, f"field {name} on page {num} is neither mapped nor writingOnly")

    def test_field_names_unique_in_document(self):
        names = [n for ns in self.by_page.values() for n in ns]
        dupes = [n for n, c in Counter(names).items() if c > 1]
        self.assertEqual(dupes, [])

    def test_field_names_match_the_page_they_are_on(self):
        for num, names in self.by_page.items():
            for n in names:
                m = re.match(r"^p(\d+)_", n)
                self.assertTrue(m, n)
                self.assertEqual(int(m.group(1)), num, f"{n} is on page {num}")

    def test_acroform_lists_every_widget(self):
        r = PdfReader(DIGITAL)
        listed = {str(f.get_object().get("/T")) for f in r.trailer["/Root"]["/AcroForm"]["/Fields"]}
        on_pages = {n for ns in self.by_page.values() for n in ns}
        self.assertEqual(listed, on_pages)


@unittest.skipUnless(os.path.exists(TEMPLATE), "pages-16-18-edit.pdf not built")
class TemplateFields(unittest.TestCase):
    def test_template_has_exactly_the_mapped_fields(self):
        m = load_map()
        by_page = widgets_by_page(TEMPLATE)
        for key, tpl_page in (("page16", 1), ("page17", 2), ("page18", 3)):
            self.assertEqual(sorted(by_page.get(tpl_page, [])), sorted(m[key].values()), key)


if __name__ == "__main__":
    unittest.main()
