"""New page 17 "My chart, part 2", drawn with reportlab in the style of page 16.

All positions are in top-down points (y from the top edge), measured from
page 16 of the v1 PDF: table head height 21.75 pt, column padding 5.63 pt,
grid 0.75 pt #cfc8db, glyph at x 39.75 and name at x 59.25, title Marcellus
54 pt at baseline 93.75, badge pill 14.25 pt high with its right edge at
562.12, footer as page 16 (copied from page 16 itself, not redrawn; see build_v2.make_page17).

Text on this page is PLACEHOLDER wording for the owner to approve, except the
four point descriptions, which are page 13's own words.
"""
from __future__ import annotations

from typo import (
    BADGE, BODY12, GLYPH, GLYPH_MC, GRID, INK, LABEL, ROWNAME,
    RULE_LIGHT, TH, TITLE, WHITE, P15_BODY, Style, draw_text,
)

TITLE_TEXT = "My chart, part 2"
BADGE_TEXT = "INTERMEDIATE"  # the level page 13 (points & patterns) carries
INTRO = (
    "Four more points from page 13. Copy the sign, degree and house of each one "
    "from your chart. Then write one sentence about it with the formula on page 5."
)
# The worksheet pages the chart tool hands out: the cells are already filled and
# the reader has no ebook pages 5 and 13 in the download, only these 3 pages.
INTRO_TOOL = (
    "We filled in the sign, degree and house for you. Read what each point means, "
    "then write one sentence about it with the formula on page 5 of your ebook."
)

# (key, glyph, glyph style, name, page 13 description)
POINTS = [
    ("southNode", "☋", "symbols", "South Node",
     "Natural talents and old habits. You can lean on them or get stuck in them."),
    ("lilith", "⚸", "symbols", "Black Moon Lilith",
     "Your wild side: the part of you that won’t be told what to do."),
    ("partOfFortune", "⊗", "inter", "Part of Fortune",
     "Where things come easily and make you happy."),
    ("vertex", "Vx", "marcellus", "Vertex",
     "Meetings and turning points that feel meant to be."),
]

# table geometry (top-down points)
X0, X1 = 33.75, 562.5
COLS = [  # (head label, x left, x right)
    ("POINT", 33.75, 183.75),
    ("SIGN", 183.75, 318.75),
    ("DEGREE", 318.75, 438.75),
    ("HOUSE", 438.75, 562.5),
]
HEAD_TOP = 160.0
HEAD_H = 21.75
ROW_H = 30.0  # data row (page 16 uses 27; a little taller to write in)
SENT_H = 120.0  # sentence area under each data row
LINE_GAP = 24.0  # writing line spacing in the sentence area
PAD = 11.25  # inner padding of the sentence area (page 16 cards: 10.9)

# field rect inset inside a table cell, measured from page 16 (left, top, right, bottom)
CELL_INSET = (1.23, 0.92, 1.70, 1.31)


def _rect(c, x0, y0, x1, y1, color, H):
    c.setFillColorRGB(*color)
    c.rect(x0, H - y1, x1 - x0, y1 - y0, stroke=0, fill=1)


def _hline(c, x0, x1, y, color, H, w=0.75):
    """A 0.75 pt rule drawn as a filled rect with its top at y (like Chromium)."""
    _rect(c, x0, y, x1, y + w, color, H)


def _vline(c, x, y0, y1, color, H, w=0.75):
    _rect(c, x, y0, x + w, y1, color, H)


def wrap(text: str, st: Style, width: float) -> list[str]:
    words = text.split(" ")
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if cur and st.width(t) > width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def badge(c, text, H, right=562.125, top=30.375, bottom=44.625):
    """Pill badge like page 16 ('BEGINNER'): 0.75 pt navy outline, text 10 px
    with 0.12 em letter-spacing. Paddings measured from page 16."""
    pad_l = 6.12
    tw = BADGE.width(text)
    # page 16: pill 503.62..562.12 for "BEGINNER" starting at 509.74
    pad_r = (562.12 - 509.74) - BADGE.width("BEGINNER")
    left = right - (pad_l + tw + pad_r)
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(0.75)
    r = (bottom - top) / 2
    c.roundRect(left, H - bottom, right - left, bottom - top, r, stroke=1, fill=0)
    draw_text(c, left + pad_l, 39.0, text, BADGE, H)


def layout():
    """Rows of the table: list of dicts with the y positions of each point."""
    rows = []
    y = HEAD_TOP + HEAD_H
    for key, *_ in POINTS:
        rows.append({"key": key, "row_top": y, "row_bot": y + ROW_H, "sent_top": y + ROW_H, "sent_bot": y + ROW_H + SENT_H})
        y += ROW_H + SENT_H
    return rows


def field_rects():
    """Where the digital page gets its form fields (top-down points).
    Returns a list of (name, kind, (x0, y0, x1, y1)) in field-number order:
    cells 1..12 (sign, degree, house for each point), multi 13..16 (sentences)."""
    out = []
    n = 1
    for r in layout():
        for _, cx0, cx1 in COLS[1:]:
            x0 = cx0 + CELL_INSET[0]
            x1 = cx1 - CELL_INSET[2]
            out.append((f"p17_cell_{n}", "cell", (x0, r["row_top"] + CELL_INSET[1], x1, r["row_bot"] - CELL_INSET[3])))
            n += 1
    for r in layout():
        top = r["sent_top"] + 44.0
        out.append((f"p17_multi_{n}", "multi", (X0 + PAD, top, X1 - PAD, r["sent_bot"] - 4.0)))
        n += 1
    return out


def draw(c, H, intro=INTRO):
    """Draw everything except background and footer (those come from page 16)."""
    badge(c, BADGE_TEXT, H)
    draw_text(c, 33.0, 93.75, TITLE_TEXT, TITLE, H)

    intro_st = P15_BODY
    y = 124.5
    for line in wrap(intro, intro_st, X1 - 33.0):
        draw_text(c, 33.0, y, line, intro_st, H)
        y += 14.25

    # table head
    for label, cx0, cx1 in COLS:
        _rect(c, cx0, HEAD_TOP, cx1, HEAD_TOP + HEAD_H, INK, H)
        draw_text(c, cx0 + 5.63, HEAD_TOP + 12.75, label, TH, H)

    for (key, glyph, gfam, name, desc), r in zip(POINTS, layout()):
        # data row cells
        for _, cx0, cx1 in COLS:
            _rect(c, cx0, r["row_top"], cx1, r["row_bot"], WHITE, H)
        # sentence area spans the whole width
        _rect(c, X0, r["sent_top"], X1, r["sent_bot"], WHITE, H)
        base = r["row_top"] + 19.5
        if gfam == "marcellus":
            draw_text(c, 39.75, base, glyph, GLYPH_MC, H)
        elif gfam == "inter":
            # page 13 draws the Inter "⊗" at 0.773 of the symbol size
            draw_text(c, 39.75, base, glyph, Style("inter", 400, 18 * 12.75 / 16.5, GLYPH.color), H)
        else:
            draw_text(c, 39.75, base, glyph, Style(gfam, 400, 18, GLYPH.color), H)
        draw_text(c, 59.25, base, name, ROWNAME, H)
        # how to find it: page 13 wording
        draw_text(c, X0 + PAD, r["sent_top"] + 18.0, desc, BODY12, H)
        draw_text(c, X0 + PAD, r["sent_top"] + 38.25, "MY SENTENCE", LABEL, H)
        for i in range(3):
            _hline(c, X0 + PAD, X1 - PAD, r["sent_top"] + 64.0 + i * LINE_GAP, RULE_LIGHT, H)

    # grid, drawn last like page 16 (0.75 pt, #cfc8db)
    rows = layout()
    top = HEAD_TOP + HEAD_H
    bottom = rows[-1]["sent_bot"]
    _vline(c, 33.0, top - 0.75, bottom, GRID, H)
    _vline(c, X1 - 0.75, top - 0.75, bottom, GRID, H)
    for r in rows:
        _hline(c, 33.0, X1, r["row_top"] - 0.75, GRID, H)
        _hline(c, 33.0, X1, r["row_bot"] - 0.75, GRID, H)
        for _, cx0, cx1 in COLS[1:]:
            _vline(c, cx0 - 0.75, r["row_top"] - 0.75, r["row_bot"], GRID, H)
    _hline(c, 33.0, X1, bottom - 0.75, GRID, H)
