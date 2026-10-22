"""Fonts and text styles of the ebook, for drawing with reportlab.

The ebook was printed by Chromium from HTML. Its body font is the variable
font Nunito Sans; Chromium picked the optical size from the CSS pixel size
(opsz = px, max 12) and drew the glyphs as Type3 outlines. We make static
instances of the same font at the same axis values with fontTools, so new
text has the same glyph shapes and widths. The weights and sizes below were
measured from the PDFs (glyph widths matched exactly, see the report).

All sizes here are CSS px (1 px = 0.75 pt), as in the original HTML.
Fonts live in tools/ebook/fonts (SIL Open Font License, see OFL-*.txt).
"""
from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass

from fontTools.ttLib import TTFont as FTFont
from fontTools.varLib import instancer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
NUNITO = os.path.join(FONT_DIR, "NunitoSans[YTLC,opsz,wdth,wght].ttf")
MARCELLUS = os.path.join(FONT_DIR, "Marcellus-Regular.ttf")
SYMBOLS = os.path.join(FONT_DIR, "NotoSansSymbols[wght].ttf")
INTER = os.path.join(FONT_DIR, "Inter[opsz,wght].ttf")

PX = 0.75  # points per CSS px

# colours measured from the PDFs
INK = (0x1E / 255, 0x1B / 255, 0x3A / 255)  # headings, badge, table head
INK2 = (0x1E / 255, 0x1B / 255, 0x2E / 255)  # bold body text
MUTED = (0x5E / 255, 0x58 / 255, 0x73 / 255)  # labels, body grey, footer
GOLD = (0x8A / 255, 0x64 / 255, 0x18 / 255)  # glyphs, gold labels
LINK = (0x2B / 255, 0x58 / 255, 0x85 / 255)  # footer link
PAPER = (0.9804, 0.9725, 0.9569)  # page background #faf8f4
WHITE = (1, 1, 1)
GRID = (0.8118, 0.7843, 0.8588)  # table grid #cfc8db
RULE = (0.5490, 0.5176, 0.6392)  # writing line #8c84a3
RULE_LIGHT = (0.7255, 0.6941, 0.8000)  # lighter writing line #b9b1cc
CARD_EDGE = (0.8510, 0.8275, 0.8902)  # card border, footer rule #d9d3e3
ROW_RULE = (0.9020, 0.8824, 0.9255)  # contents row rule #e6e1ec
LEADER = (0.6549, 0.6235, 0.7255)  # contents leader dots

_cache_dir = os.path.join(tempfile.gettempdir(), "ebook-v2-fonts-2")
_registered: dict[str, str] = {}


def _instance(path: str, axes: dict) -> str:
    """Static instance of a variable font, cached on disk. Returns the file."""
    key = hashlib.sha1((os.path.basename(path) + repr(sorted(axes.items()))).encode()).hexdigest()[:12]
    os.makedirs(_cache_dir, exist_ok=True)
    out = os.path.join(_cache_dir, f"inst-{key}.ttf")
    if not os.path.exists(out):
        f = FTFont(path)
        inst = instancer.instantiateVariableFont(f, axes)
        # reportlab caches faces by PostScript name: give each instance its own
        ps = inst["name"].getDebugName(6) + "-" + "-".join(f"{k}{v:g}" for k, v in sorted(axes.items()))
        ps = ps.replace(".", "_")
        for rec in inst["name"].names:
            if rec.nameID in (4, 6):
                rec.string = ps
        inst.save(out)
    return out


def font(family: str, wght: int = 400, px: float = 12) -> str:
    """Register (once) and return the reportlab font name for a family at a
    weight and CSS px size (the size picks the optical size axis)."""
    if family == "nunito":
        opsz = max(6.0, min(12.0, px))
        axes = {"wght": wght, "opsz": opsz, "wdth": 100, "YTLC": 500}
        name = f"NunitoSans-{wght}-{opsz:g}"
        path = NUNITO
    elif family == "marcellus":
        name, path, axes = "Marcellus", MARCELLUS, None
    elif family == "symbols":
        name, path, axes = "NotoSansSymbols", SYMBOLS, {"wght": 400}
    elif family == "inter":
        opsz = max(14.0, min(32.0, px))
        name, path, axes = f"Inter-{wght}-{opsz:g}", INTER, {"wght": wght, "opsz": opsz}
    else:
        raise ValueError(family)
    if name not in _registered:
        file = _instance(path, axes) if axes else path
        pdfmetrics.registerFont(TTFont(name, file))
        _registered[name] = file
    return name


@dataclass(frozen=True)
class Style:
    family: str
    wght: int
    px: float
    color: tuple
    ls_em: float = 0.0  # CSS letter-spacing in em

    @property
    def size(self) -> float:  # points
        return self.px * PX

    @property
    def font(self) -> str:
        return font(self.family, self.wght, self.px)

    @property
    def char_space(self) -> float:  # points
        return self.ls_em * self.size

    def width(self, text: str) -> float:
        """Advance width in points, including CSS letter-spacing after every
        character (as Chromium lays it out)."""
        return pdfmetrics.stringWidth(text, self.font, self.size) + self.char_space * len(text)


# Styles measured from the ebook pages (page numbers are the old v1 pages).
BADGE = Style("nunito", 400, 10, INK, 0.12)  # p16 "BEGINNER"
TITLE = Style("marcellus", 400, 72, INK)  # p16 "My chart"
LABEL = Style("nunito", 700, 11, MUTED, 0.14)  # p16 "NAME"
TH = Style("nunito", 700, 10.5, PAPER, 0.08)  # p16 table head
ROWNAME = Style("nunito", 700, 13.5, INK2)  # p16 "Sun"
GLYPH = Style("symbols", 400, 18, GOLD)  # p16 row glyphs
GLYPH_MC = Style("marcellus", 400, 14, GOLD)  # p16 "MC" (10.5 pt)
BODY12 = Style("nunito", 400, 12, MUTED)  # p16 "My core self is..."
FOOT = Style("nunito", 400, 11, MUTED)  # footer
FOOT_LINK = Style("nunito", 400, 11, LINK)
CONTENTS_ROW = Style("nunito", 400, 14.5, INK2)  # p3 rows and numbers
P2_BODY = Style("nunito", 400, 13.5, INK2)  # p2 step text (10.125 pt)
P2_BOLD = Style("nunito", 700, 13.5, INK2)
P15_BODY = Style("nunito", 400, 13, INK2)  # p15 card text (9.75 pt)
P15_BOLD = Style("nunito", 700, 13, INK2)
P15_LEAD = Style("nunito", 400, 14.5, INK2)  # p15 lead paragraph (10.875 pt)
P15_LABEL = Style("nunito", 700, 10, GOLD, 0.12)  # "WORKSHEET 1 · PAGE 16"
P15_STEPNUM = Style("nunito", 700, 12, PAPER)  # number in the navy circle
P15_CARD_TITLE = Style("marcellus", 400, 20, INK)  # "My chart" (15 pt)
BODY13 = Style("nunito", 400, 13, INK2)  # p6/p7 body (9.75 pt)


def draw_text(c, x: float, y_td: float, text: str, st: Style, page_h: float, color=None):
    """Draw text with its baseline at top-down y. Returns the end x."""
    t = c.beginText()
    t.setTextOrigin(x, page_h - y_td)
    t.setFont(st.font, st.size)
    t.setCharSpace(st.char_space)
    c.setFillColorRGB(*(color or st.color))
    t.textOut(text)
    c.drawText(t)
    return x + st.width(text)
