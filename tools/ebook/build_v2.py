"""Build "Read Your Own Chart" v2 from the v1 PDFs (the HTML source is lost).

    python tools/ebook/build_v2.py

Reads  private-files/Read-Your-Own-Chart_cosmic_universum_DIGITAL.pdf
       private-files/Read-Your-Own-Chart_cosmic_universum_PRINT.pdf
       private-files/Read-Your-Own-Chart-cosmic_universum.pdf      (plain)
Writes private-files/v2/  the three v2 PDFs, plus the worksheet templates
       pages-16-18-edit.pdf (digital, fields kept) and pages-16-18-print.pdf.

What changes (see the Task 7 report for the full list):
* new page 17 "My chart, part 2" (South Node, Black Moon Lilith, Part of
  Fortune, Vertex), redrawn in the book's style; its background and footer
  are copied from page 16, so they are the same to the pixel;
* old pages 17-19 become 18-20 (footers, contents, outline, links);
* every in-text page reference that pointed at 17-19 is renumbered;
* page 2 step 2, page 15 and the new page carry PLACEHOLDER wording that
  points to cosmicuniversum.com/tools (Whole Sign); the owner approves it;
* digital edition: old p17_* fields become p18_*, new p17_* fields are added.

Only pypdf, reportlab and fontTools are used (permissive licences). The
originals are opened read-only. PyMuPDF is NOT used here (see visual_diff.py).
"""
from __future__ import annotations

import io
import os
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject,
    TextStringObject,
)
from reportlab.pdfgen import canvas
from reportlab import rl_config

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import page17  # noqa: E402
from pdfedit import PageEditor  # noqa: E402
from typo import (  # noqa: E402
    CONTENTS_ROW, FOOT, INK, LEADER, P15_BODY, P15_BOLD, P15_CARD_TITLE,
    P15_LABEL, P15_LEAD, P15_STEPNUM, P2_BODY, P2_BOLD, PAPER, Style, draw_text,
)

rl_config.invariant = 1  # reproducible reportlab output

REPO = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(REPO, "private-files")
OUT = os.path.join(SRC, "v2")
INPUTS = {
    "digital": "Read-Your-Own-Chart_cosmic_universum_DIGITAL.pdf",
    "print": "Read-Your-Own-Chart_cosmic_universum_PRINT.pdf",
    "plain": "Read-Your-Own-Chart-cosmic_universum.pdf",
}
OUTPUTS = {
    "digital": "Read-Your-Own-Chart_cosmic_universum_DIGITAL_v2.pdf",
    "print": "Read-Your-Own-Chart_cosmic_universum_PRINT_v2.pdf",
    "plain": "Read-Your-Own-Chart-cosmic_universum_v2.pdf",
}

# ---------------------------------------------------------------------------
# PLACEHOLDER wording. The owner approves it before release. While
# MARK_PLACEHOLDERS is True every placeholder block gets a small red
# "PLACEHOLDER" tag so nobody mistakes the draft for final text.
MARK_PLACEHOLDERS = False
P2_STEP2 = "go to cosmicuniversum.com/tools and type in your details. It uses Whole Sign houses."
P15_BEFORE = (
    "Have your chart from cosmicuniversum.com/tools (page 2, Whole Sign houses), "
    "a pencil so you can change answers, and the cheat sheets on pages 7–14."
)
P15_NEXT_PAGES = "three"  # "The next two pages are yours to fill in." -> three
P15_ASPECTS = ("in the chart", "tool.")  # "on your chart" / "website." in step 4
P15_NEW_LABEL = "WORKSHEET 2 · PAGE 17"
P15_NEW_TITLE = "My chart, part 2"
P15_NEW_STEP = ("Four points:", " copy the sign, degree and house of each (page 13). Then write a sentence.")
P4_HOUSE1 = "In Whole Sign, house 1 is this whole sign."
GLOSSARY_HOUSE_EXAMPLE = "Whole Sign"
CONTENTS_NEW = "Worksheet 2: South Node, Lilith, Part of Fortune & Vertex"
CONTENTS_OLD_W2 = "Worksheet 3: my balance, aspects & chart story"
OUTLINE_NEW = "17  Worksheet 2: my chart, part 2"
# ---------------------------------------------------------------------------

RED = (0.80, 0.10, 0.10)
TAG = Style("nunito", 800, 9, RED, 0.08)

CHANGES: list[str] = []  # human-readable change log, printed and used by the report


def log(variant, msg):
    if variant == "digital":
        CHANGES.append(msg)


# ------------------------------------------------------------------ page jobs
class Job:
    """Edits one page: deletions and moves on the original content stream,
    new drawing with reportlab merged on top. New text that belongs in a
    line of the original text is then spliced into the original text block,
    so text search and copy read "page 18", not "page 1 ." + "8"."""

    def __init__(self, page, w):
        self.page = page
        self.w = w
        self.H = float(page.mediabox.height)
        self.W = float(page.mediabox.width)
        self.ed = PageEditor(page, w, self.H)
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=(self.W, self.H), pageCompression=1)
        self.used = False
        self.reqs = []  # (kind, anchor (x, y), (x, y, text))

    def text(self, x, y, s, st, color=None, at_td=None, after=None):
        """Draw text with baseline y (top-down). at_td=(x, y): splice where a
        deleted glyph was; after=(x, y): splice after the glyph at (x, y)."""
        self.used = True
        end = draw_text(self.c, x, y, s, st, self.H, color)
        if at_td is not None:
            self.reqs.append(("td", at_td, (x, y, s)))
        elif after is not None:
            self.reqs.append(("glyph", after, (x, y, s)))
        return end

    def tag(self, x, y):
        if MARK_PLACEHOLDERS:
            self.text(x, y, "PLACEHOLDER", TAG)

    def overlay_page(self):
        self.c.showPage()
        self.c.save()
        return PdfReader(io.BytesIO(self.buf.getvalue())).pages[0]

    def finish(self):
        # empty text blocks stay until the splice: they can be anchors
        self.ed.save(keep_empty=bool(self.reqs))
        if not self.used:
            return
        self.page.merge_page(self.overlay_page())
        if not self.reqs:
            return
        ed2 = PageEditor(self.page, self.w, self.H)
        for kind, anchor, (x, y, s) in self.reqs:
            src = ed2.overlay_unit(x, y, s)
            target, k = ed2.anchor_td(*anchor) if kind == "td" else ed2.anchor_glyph(*anchor)
            ed2.splice(src, target, k)
        ed2.save()


def style_at(base: Style, glyph, wght=None):
    """Same family as base, size of an existing glyph record."""
    size_pt = glyph[4]
    return Style(base.family, wght or base.wght, round(size_pt / 0.75 * 8) / 8, base.color, base.ls_em)


def swap_chars(job, glyphs, new_text, st: Style, color):
    """Replace a run of single-character glyphs by new_text of the same
    length, character by character (digits are tabular in Nunito Sans, so
    positions stay exact). Unchanged characters keep their original glyph."""
    old = "".join(g[5] for g in glyphs)
    assert len(old) == len(new_text) == len(glyphs), (old, new_text)
    for g, o, n in zip(glyphs, old, new_text):
        if o != n:
            job.ed.delete_glyphs([g])
            job.text(g[2], g[3], n, st, color, at_td=(g[2], g[3]))
    return old


def take(glyphs, text, start=0):
    """The glyphs, from index start, whose texts join to exactly `text`."""
    acc, out = "", []
    for g in glyphs[start:]:
        if acc == text:
            break
        acc += g[5]
        out.append(g)
    assert acc == text, (acc, text)
    return out


def replace_word(job, glyphs, new, st, shift=True):
    """Replace a word inside a line; the rest of the line moves by the
    width difference (its original glyphs are kept)."""
    color = glyphs[0][0].extra["fill"]
    old = "".join(g[5] for g in glyphs)
    dx = st.width(new) - st.width(old)
    job.ed.delete_glyphs(glyphs)
    if shift and abs(dx) > 1e-6:
        job.ed.shift_line_after(glyphs[0][3], glyphs[-1][2], dx)
    job.text(glyphs[0][2], glyphs[0][3], new, st, color, at_td=(glyphs[0][2], glyphs[0][3]))


def renumber(job, needle, old_num, new_num, st, variant, where, near_y=None):
    """Find needle (which contains old_num), swap the digits to new_num."""
    hit = job.ed.find_one(needle, near_y)
    text = "".join(g[5] for g in hit)
    i = text.index(old_num)
    run = hit[i : i + len(old_num)]
    color = run[0][0].extra["fill"]
    swap_chars(job, run, new_num, style_at(st, run[0]), color)
    log(variant, f"{where}: “{text}” → “{text.replace(old_num, new_num, 1)}”")


# --------------------------------------------------------------- the edits
def edit_page2(page, w, variant):
    job = Job(page, w)
    ed = job.ed
    renumber(job, "pages 15–17", "17", "18", P2_BODY, variant, "p2 New to astrology")

    # step 2: keep the bold lead "Make your chart:", rewrite the rest
    lead = ed.find_one("Make your chart:")
    x0, base = lead[0][2], lead[0][3]
    lead_end = lead[-1][2] + P2_BOLD.width(lead[-1][5])
    old_lines = ["".join(r[5] for r in g if x0 - 1 < r[2] < x0 + 135) for y, t, g in ed.lines() if base - 1 < y < base + 70]
    n = ed.delete_text((lead_end + 0.5, base - 1, x0 + 140, base + 1))
    n += ed.delete_text((x0 - 1, base + 1, x0 + 140, base + 70))
    assert n > 50, n
    width = 130.0  # card 218.62..376.88 minus 14.1 pt padding each side
    space = P2_BODY.width(" ")
    first_w = width - (lead_end - x0) - space
    words = P2_STEP2.split(" ")
    line, lines, avail = "", [], first_w
    for wd in words:
        t = (line + " " + wd).strip()
        if line and P2_BODY.width(t) > avail:
            lines.append(line)
            line, avail = wd, width
        else:
            line = t
    lines.append(line)
    assert len(lines) <= 5, lines
    color = lead[0][0].extra["fill"]
    anchor = (lead[-1][2], lead[-1][3])  # the ":" of the bold lead
    job.text(lead_end + space, base, lines[0], P2_BODY, color, after=anchor)
    for k, ln in enumerate(lines[1:], 1):
        job.text(x0, base + 15.0 * k, ln, P2_BODY, color, after=anchor)
    job.tag(x0 + 52, base - 20.25)
    log(variant, "p2 step 2: “" + " ".join(old_lines) + "” → “Make your chart: " + P2_STEP2 + "” (PLACEHOLDER)")
    job.finish()


def edit_page3(page, w, variant):
    """Contents: new row for page 17, old rows 17-19 become 18-20."""
    job = Job(page, w)
    ed, H = job.ed, job.H
    pitch = 25.5
    w2 = ed.find_one("Worksheet 2: my balance, aspects & chart story")
    base = w2[0][3]  # 567.0
    part4 = ed.find_one("PART 4")
    assert abs(part4[0][3] - (base + 35.25)) < 0.5
    w1num = ed.find_one("16", near_y=base - pitch)  # "16" of the Worksheet 1 row
    # 1. Part 4 and Part 5 (heading, row text, leaders, rules) move down one row
    moved = ed.shift((0, base + 12, job.W, base + 130), pitch)
    assert moved > 300, moved
    # 2. the row rule under "Worksheet 2" is copied one row down (new row)
    rule = lambda u: u.bbox[2] - u.bbox[0] > 400  # noqa: E731
    assert ed.duplicate((40, base + 8, 560, base + 10), pitch, pred=rule) == 1
    # 3. the old "Worksheet 2" text, its number and its leader dots go;
    #    both rows are written again with new leaders
    num = ed.find_one("17", near_y=base)
    ed.delete_glyphs(w2 + num)
    dots = ed.delete_paths((40, base - 5, 560, base + 2), pred=lambda u: u.bbox[2] - u.bbox[0] < 2)
    assert dots > 100, dots
    color = w2[0][0].extra["fill"]
    anchor = (w1num[-1][2], w1num[-1][3])
    for k, (label, number) in enumerate([(CONTENTS_NEW, "17"), (CONTENTS_OLD_W2, "18")]):
        y = base + k * pitch
        end = job.text(48.0, y, label, CONTENTS_ROW, color, after=anchor)
        job.text(534.45, y, number, CONTENTS_ROW, color, after=anchor)
        # leader: 0.75 pt dots every 1.5 pt, last dot ends at 528.75 (as v1)
        job.c.setFillColorRGB(*LEADER)
        x = 528.0
        while x >= end + 6.0:
            job.c.rect(x, H - (y - 3.0), 0.75, 0.75, stroke=0, fill=1)
            x -= 1.5
    log(variant, f"p3 contents: “Worksheet 2: my balance, aspects & chart story … 17” → “{CONTENTS_NEW} … 17” (new, PLACEHOLDER) + “{CONTENTS_OLD_W2} … 18”")
    renumber(job, "18", "18", "19", CONTENTS_ROW, variant, "p3 contents 2027 at a glance", near_y=base + 58.5 + pitch)
    renumber(job, "19", "19", "20", CONTENTS_ROW, variant, "p3 contents Where to go next", near_y=base + 116.25 + pitch)
    log(variant, "p3 contents: Part 4 and Part 5 moved down one row (25.5 pt)")
    job.tag(430.0, part4[0][3] - 108.75)  # beside the PART 3 heading
    job.finish()
    # links: rows below the insert move down; the old row link moves to the
    # new 'Worksheet 3' row; a new link for page 17 is added by the caller
    y_pdf = H - base
    for a in page.get("/Annots", []):
        a = a.get_object()
        if a.get("/Subtype") != "/Link" or "/Dest" not in a:
            continue
        r = [float(v) for v in a["/Rect"]]
        if r[3] <= y_pdf + 16:  # the Worksheet 2 row and everything below
            a[NameObject("/Rect")] = ArrayObject([FloatObject(r[0]), FloatObject(r[1] - pitch), FloatObject(r[2]), FloatObject(r[3] - pitch)])
    return base, pitch


def edit_page6(page, w, variant):
    job = Job(page, w)
    renumber(job, "summary on page 17", "17", "18", Style("nunito", 400, 13, INK), variant, "p6 Put it together")
    job.finish()


def edit_page7(page, w, variant):
    job = Job(page, w)
    renumber(job, "Count your own on page 17", "17", "18", Style("nunito", 400, 13, INK), variant, "p7 Too much or too little")
    job.finish()


def edit_page4(page, w, variant):
    """AC entry: house 1 in Whole Sign (the tool's only house system)."""
    job = Job(page, w)
    ed = job.ed
    born = ed.find_one("horizon when you were born.")
    x0, b1 = born[0][2], born[0][3]
    anchor = (born[-1][2], b1)  # the "." that ends the kept part
    b2 = b1 + 14.25
    ed.delete_text((anchor[0] + 1, b1 - 1, 560, b1 + 1))  # " In most house"
    n = ed.delete_text((x0 - 1, b2 - 1, 560, b2 + 1))  # "systems, house 1 starts here."
    assert n == 27, n
    job.text(x0, b2, P4_HOUSE1, P15_BODY, born[0][0].extra["fill"], after=anchor)
    log(variant, f"p4 AC: “In most house systems, house 1 starts here.” → “{P4_HOUSE1}”")
    job.finish()


def edit_glossary(page, w, variant):
    """Glossary (page 19): the house-system example is Whole Sign."""
    job = Job(page, w)
    hit = job.ed.find_one("example Placidus.")
    replace_word(job, take(hit, "Placidus", start=8), GLOSSARY_HOUSE_EXAMPLE, P15_BODY)
    log(variant, f"p19 glossary House system: “for example Placidus.” → “for example {GLOSSARY_HOUSE_EXAMPLE}.”")
    job.finish()


def edit_page15(page, w, variant):
    job = Job(page, w)
    ed, H = job.ed, job.H

    # lead: "The next two pages" -> "The next three pages"
    hit = ed.find_one("next two pages")
    two = take(hit, "two", start=5)
    replace_word(job, two, P15_NEXT_PAGES, P15_LEAD)
    job.tag(two[0][2] - 20, two[0][3] - 13)
    log(variant, f"p15 lead: “The next two pages are yours” → “The next {P15_NEXT_PAGES} pages are yours” (PLACEHOLDER)")

    # before you start: rewrite both lines
    first = ed.find_one("Have your birth chart from a free website (page 2)")
    second = ed.find_one("and the cheat sheets on pages 7–14.")
    x0, b1, b2 = first[0][2], first[0][3], second[0][3]
    old = ["".join(r[5] for r in g if r[2] > x0 - 1) for y, t, g in ed.lines() if abs(y - b1) < 0.6 or abs(y - b2) < 0.6]
    ed.delete_text((x0 - 1, b1 - 1, 560, b1 + 1))
    ed.delete_text((x0 - 1, b2 - 1, 560, b2 + 1))
    color = first[0][0].extra["fill"]
    lines = page17.wrap(P15_BEFORE, P15_BODY, 547.0 - x0)
    assert len(lines) == 2, lines
    # splice after the box heading: it is drawn after the box background
    head = [g for y, t, g in ed.lines() if abs(y - (b1 + 9.0)) < 1.0 and g[0][2] < x0 - 20]
    assert len(head) == 1, head
    anchor = (head[0][-1][2], head[0][-1][3])
    job.text(x0, b1, lines[0], P15_BODY, color, after=anchor)
    job.text(x0, b2, lines[1], P15_BODY, color, after=anchor)
    job.tag(x0, b1 - 10.5)
    log(variant, "p15 before you start: “" + " ".join(t for t in old if t) + "” → “" + P15_BEFORE + "” (PLACEHOLDER)")

    # worksheet 2 (old) is now worksheet 3 on page 18
    renumber(job, "WORKSHEET 2 · PAGE 17", "WORKSHEET 2 · PAGE 17", "WORKSHEET 3 · PAGE 18", P15_LABEL, variant, "p15 right card label")

    # step 4 (aspects): "on your chart website." -> "in the chart tool."
    a1 = ed.find_one("on your chart")
    replace_word(job, a1, P15_ASPECTS[0], P15_BODY, shift=False)  # end of line
    a2 = ed.find_one("website. Pick the 3")
    replace_word(job, take(a2, "website."), P15_ASPECTS[1], P15_BODY)
    job.tag(487.0, a1[0][3] - 10.5)
    log(variant, "p15 step 4: “find the aspect list on your chart website.” → “find the aspect list in the chart tool.” (PLACEHOLDER)")

    # left card: add worksheet 2 (new page 17) under step 4
    lab1 = ed.find_one("WORKSHEET 1 · PAGE 16")
    lx = lab1[0][2]
    last = ed.find_one("house it is in.")
    anchor = (last[-1][2], last[-1][3])
    y0 = last[0][3] + 22.5
    job.text(lx, y0, P15_NEW_LABEL, P15_LABEL, lab1[0][0].extra["fill"], after=anchor)
    job.text(lx, y0 + 18.75, P15_NEW_TITLE, P15_CARD_TITLE, after=anchor)
    # navy step circle with "1", like the other steps (16.5 pt circle)
    cy = y0 + 18.75 + 20.25
    job.c.setFillColorRGB(*INK)
    job.c.circle(lx + 8.25, H - (cy - 1.5), 8.25, stroke=0, fill=1)
    job.text(lx + 5.54, cy + 0.75, "1", P15_STEPNUM)  # stays on top of its circle
    tx = 72.75
    end = job.text(tx, cy, P15_NEW_STEP[0], P15_BOLD, after=anchor)
    first_room = 278.0 - end - P15_BODY.width(" ")
    words = P15_NEW_STEP[1].strip().split(" ")
    l1 = ""
    while words and P15_BODY.width((l1 + " " + words[0]).strip()) <= first_room:
        l1 = (l1 + " " + words.pop(0)).strip()
    if l1:
        job.text(end + P15_BODY.width(" "), cy, l1, P15_BODY, after=anchor)
    rest = page17.wrap(" ".join(words), P15_BODY, 278.0 - tx)
    for k, ln in enumerate(rest, 1):
        job.text(tx, cy + 13.5 * k, ln, P15_BODY, after=anchor)
    assert cy + 13.5 * len(rest) < 520, ("new step does not fit in the card", cy, l1, rest)
    job.tag(lx + 125, y0)
    log(variant, f"p15 left card: added “{P15_NEW_LABEL} / {P15_NEW_TITLE} / 1 {P15_NEW_STEP[0]}{P15_NEW_STEP[1]}” (PLACEHOLDER)")
    job.finish()


def edit_footer(page, w, variant, old, new):
    job = Job(page, w)
    lines = [(y, t, g) for y, t, g in job.ed.lines() if y > job.H - 45 and t == old]
    assert len(lines) == 1, lines
    run = lines[0][2]
    swap_chars(job, run, new, style_at(FOOT, run[0]), run[0][0].extra["fill"])
    log(variant, f"footer page {old} → {new}")
    job.finish()


# --------------------------------------------------------------- new page
def make_page17(w, src_path, variant):
    """New page 17. The footer (rule, text, link) is page 16's own footer,
    copied from a fresh reader with the number changed to 17. Under it, a
    reportlab page draws the background and the new content, so the text
    reads title first and footer last."""
    src = PdfReader(src_path)
    p = src.pages[15]
    if "/Annots" in p:
        keep = [a for a in p["/Annots"] if a.get_object().get("/Subtype") == "/Link"]
        p[NameObject("/Annots")] = ArrayObject(keep)
    w.insert_page(p, 16)
    page = w.pages[16]
    job = Job(page, w)
    ed, H, W = job.ed, job.H, job.W
    footer_top = 790.0
    bg = None
    for u in ed.units:
        if u.kind not in ("path", "text") or u.bbox is None or u.clip:
            continue
        b = u.bbox
        if u.kind == "path" and (b[2] - b[0]) > W * 0.9 and (b[3] - b[1]) > H * 0.9:
            bg = b  # page background: drawn again by reportlab underneath
        elif b[1] >= footer_top:
            continue  # footer: keep
        if u.kind == "text":
            ed.delete_glyphs([(u, k, p_[0], p_[1], s, u.extra["texts"][k]) for k, p_, s in list(u.extra["glyphs"])])
        else:
            u.ops, u.kind = [], "deleted"
    assert bg is not None
    run = [(y, t, g) for y, t, g in ed.lines() if t == "16"]
    assert len(run) == 1
    swap_chars(job, run[0][2], "17", style_at(FOOT, run[0][2][0]), run[0][2][0][0].extra["fill"])
    job.finish()
    _prune_fonts(page, PageEditor(page, w, H))

    under = Job(page, w)  # only its canvas is used
    c = under.c
    c.setFillColorRGB(*PAPER)
    c.rect(bg[0], H - bg[3], bg[2] - bg[0], bg[3] - bg[1], stroke=0, fill=1)
    page17.draw(c, H)
    if MARK_PLACEHOLDERS:
        draw_text(c, 33.0, 153.0, "PLACEHOLDER (intro and layout; the four descriptions are page 13’s words)", TAG, H)
    page.merge_page(under.overlay_page(), over=False)
    log(variant, "p17 new page “My chart, part 2” inserted (South Node, Black Moon Lilith, Part of Fortune, Vertex)")
    return page


def _compress(page):
    """Flate-compress a page's content if an edit left it uncompressed."""
    c = page.get("/Contents")
    if c is None:
        return
    objs = c.get_object()
    objs = objs if isinstance(objs, ArrayObject) else [c]
    if any("/Filter" not in o.get_object() for o in objs):
        page.compress_content_streams()


def _prune_fonts(page, ed):
    used = set()
    for u in ed.units:
        if u.kind == "text" and u.extra["glyphs"]:
            for operands, op in [o for o in u.ops if o is not None]:
                if op == b"Tf":
                    used.add(operands[0])
    fonts = page["/Resources"]["/Font"]
    for name in list(fonts.keys()):
        if name not in used:
            del fonts[name]


# ------------------------------------------------------------ form fields
def _widget(w, page, name, rect_td, H, multi=False, da="/Helv 11 Tf 0.12 0.11 0.18 rg"):
    x0, y0, x1, y1 = rect_td
    d = DictionaryObject()
    d[NameObject("/Type")] = NameObject("/Annot")
    d[NameObject("/Subtype")] = NameObject("/Widget")
    d[NameObject("/FT")] = NameObject("/Tx")
    d[NameObject("/T")] = TextStringObject(name)
    d[NameObject("/Rect")] = ArrayObject([FloatObject(round(x0, 4)), FloatObject(round(H - y1, 4)), FloatObject(round(x1, 4)), FloatObject(round(H - y0, 4))])
    d[NameObject("/F")] = NumberObject(4)
    d[NameObject("/DA")] = TextStringObject(da)
    d[NameObject("/MK")] = DictionaryObject()
    if multi:
        d[NameObject("/Ff")] = NumberObject(4096)
    d[NameObject("/P")] = page.indirect_reference
    return w._add_object(d)


def fields(w, page17_obj):
    """Rename old p17_* to p18_*, add the new page-17 fields."""
    old = w.pages[17]
    renamed = 0
    for a in old.get("/Annots", []):
        a = a.get_object()
        t = a.get("/T")
        if a.get("/Subtype") == "/Widget" and t and t.startswith("p17_"):
            a[NameObject("/T")] = TextStringObject("p18_" + t[4:])
            renamed += 1
    assert renamed == 27, renamed
    H = float(page17_obj.mediabox.height)
    annots = page17_obj.get("/Annots")
    if annots is None:
        annots = ArrayObject()
        page17_obj[NameObject("/Annots")] = annots
    acro = w._root_object["/AcroForm"]
    for name, kind, rect in page17.field_rects():
        ref = _widget(w, page17_obj, name, rect, H, multi=(kind == "multi"))
        annots.append(ref)
        acro["/Fields"].append(ref)
    CHANGES.append(f"fields: 27 fields p17_* renamed p18_*; {len(page17.field_rects())} new fields p17_cell_1..12, p17_multi_13..16")


# --------------------------------------------------- links and outline
def link_for_new_row(w, page3, base, H):
    """Contents link for the new page-17 row (same shape as the others)."""
    d = DictionaryObject()
    d[NameObject("/Type")] = NameObject("/Annot")
    d[NameObject("/Subtype")] = NameObject("/Link")
    # v1 rows: the link spans the row, 25.5 pt high, x 48.0 .. 547.92, its top
    # 15.12 pt above the baseline (row "Worksheet 2", baseline 567: 265.5..291.0)
    y_top = H - base + 15.12
    d[NameObject("/Rect")] = ArrayObject([FloatObject(48.0), FloatObject(y_top - 25.5), FloatObject(547.92), FloatObject(y_top)])
    d[NameObject("/Border")] = ArrayObject([NumberObject(0), NumberObject(0), NumberObject(0)])
    d[NameObject("/Dest")] = ArrayObject([w.pages[16].indirect_reference, NameObject("/Fit")])
    ref = w._add_object(d)
    page3["/Annots"].append(ref)


def outline(w, variant):
    root = w._root_object["/Outlines"]

    def walk(node, depth=0):
        item = node.get("/First")
        while item is not None:
            o = item.get_object()
            yield item, o, depth
            yield from walk(o, depth + 1)
            item = o.get("/Next")

    items = list(walk(root))
    renames = {
        "17  Worksheet 2: balance & story": "18  Worksheet 3: balance & story",
        "18  Sky calendar 2027": "19  Sky calendar 2027",
        "19  Next steps & glossary": "20  Next steps & glossary",
    }
    before = None
    for ref, o, depth in items:
        t = o.get("/Title")
        if t in renames:
            if t.startswith("17"):
                before = ref
            o[NameObject("/Title")] = TextStringObject(renames[t])
            log(variant, f"outline: “{t}” → “{renames[t]}”")
    if before is None:
        assert not items, "outline present but without the expected titles"
        return  # the plain v1 edition has an empty outline
    # insert a new item before "18  Worksheet 3", same shape as v1 items
    # (/A GoTo [page /Fit], /Count 0); parent and root counts grow by one
    nxt = before.get_object()
    parent_ref = nxt.raw_get("/Parent")
    prev_ref = nxt.raw_get("/Prev")
    act = DictionaryObject({NameObject("/S"): NameObject("/GoTo"),
                            NameObject("/D"): ArrayObject([w.pages[16].indirect_reference, NameObject("/Fit")])})
    item = DictionaryObject({
        NameObject("/Title"): TextStringObject(OUTLINE_NEW),
        NameObject("/A"): w._add_object(act),
        NameObject("/Parent"): parent_ref,
        NameObject("/Count"): NumberObject(0),
        NameObject("/Next"): before,
    })
    if prev_ref is not None:
        item[NameObject("/Prev")] = prev_ref
    ref = w._add_object(item)
    nxt[NameObject("/Prev")] = ref
    if prev_ref is not None:
        prev_ref.get_object()[NameObject("/Next")] = ref
    else:
        parent_ref.get_object()[NameObject("/First")] = ref
    node = parent_ref.get_object()
    while node is not None:
        node[NameObject("/Count")] = NumberObject(int(node["/Count"]) + 1)
        node = node.get("/Parent")
        node = node.get_object() if node is not None else None
    log(variant, f"outline: added “{OUTLINE_NEW}”")


# ------------------------------------------------------------------ build
def build(variant):
    src_path = os.path.join(SRC, INPUTS[variant])
    reader = PdfReader(src_path)
    assert len(reader.pages) == 19
    w = PdfWriter(clone_from=reader)
    edit_page2(w.pages[1], w, variant)
    base, pitch = edit_page3(w.pages[2], w, variant)
    edit_page4(w.pages[3], w, variant)
    edit_page6(w.pages[5], w, variant)
    edit_page7(w.pages[6], w, variant)
    edit_page15(w.pages[14], w, variant)
    edit_glossary(w.pages[18], w, variant)
    edit_footer(w.pages[16], w, variant, "17", "18")
    edit_footer(w.pages[17], w, variant, "18", "19")
    edit_footer(w.pages[18], w, variant, "19", "20")
    p17 = make_page17(w, src_path, variant)
    H = float(w.pages[2].mediabox.height)
    link_for_new_row(w, w.pages[2], base, H)
    outline(w, variant)
    if variant == "digital":
        fields(w, p17)
    for page in w.pages:
        _compress(page)
    w.compress_identical_objects(remove_identicals=False, remove_orphans=True)
    w.add_metadata({"/Producer": "pypdf"})
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, OUTPUTS[variant])
    with open(out, "wb") as f:
        w.write(f)
    return out


def templates():
    """Pages 16-18 of v2 as stand-alone templates for the chart tool (Task 8):
    pages-16-18-edit.pdf from the digital v2 (fields kept, outline and the
    contents links dropped) and pages-16-18-print.pdf from the print v2."""
    for variant, name in (("digital", "pages-16-18-edit.pdf"), ("print", "pages-16-18-print.pdf")):
        r = PdfReader(os.path.join(OUT, OUTPUTS[variant]))
        w = PdfWriter()
        for i in (15, 16, 17):
            w.add_page(r.pages[i])
        if variant == "digital":
            fields_ = []
            for p in w.pages:
                for a in p.get("/Annots", []):
                    if a.get_object().get("/Subtype") == "/Widget":
                        fields_.append(a)
            acro = DictionaryObject()
            src_acro = r.trailer["/Root"]["/AcroForm"]
            acro[NameObject("/Fields")] = ArrayObject(fields_)
            acro[NameObject("/NeedAppearances")] = src_acro["/NeedAppearances"]
            acro[NameObject("/DA")] = src_acro["/DA"]
            acro[NameObject("/DR")] = src_acro["/DR"].get_object().clone(w)
            w._root_object[NameObject("/AcroForm")] = w._add_object(acro)
        w.add_metadata({"/Title": "Read Your Own Chart — worksheet pages 16–18", "/Author": "cosmic_universum", "/Producer": "pypdf"})
        with open(os.path.join(OUT, name), "wb") as f:
            w.write(f)


def main():
    outs = [build(v) for v in ("digital", "print")]  # plain edition dropped (older text)
    templates()
    for o in outs:
        print("wrote", os.path.relpath(o, REPO))
    print("wrote", os.path.relpath(os.path.join(OUT, "pages-16-18-edit.pdf"), REPO))
    print("wrote", os.path.relpath(os.path.join(OUT, "pages-16-18-print.pdf"), REPO))
    print("\nchanges (digital edition):")
    for c in CHANGES:
        print(" -", c)


if __name__ == "__main__":
    main()
