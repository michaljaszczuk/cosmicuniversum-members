"""Build the paid birth chart report PDF (V3).

Run: py tools/report/build_report.py <facts.json> <content.json> <out.pdf>
Tables and labels come from facts.json and library.json (code, not AI).
Reading sentences come from content.json (checked by validate.py first).
"""
import json
import math
import os
import sys
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether,
                                NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "ebook"))
import typo  # noqa: E402  (ebook fonts and colours)
from report_text import ORD, RULER_STEPS, fill_aspect, reason_line, tension_examples  # noqa: E402

LIB = json.loads((HERE / "library.json").read_text(encoding="utf-8"))

C = lambda rgb: colors.Color(*rgb)  # noqa: E731
INK, MUTED, GOLD, PAPER, GRID, EDGE = (C(typo.INK), C(typo.MUTED), C(typo.GOLD), C(typo.PAPER),
                                       C(typo.GRID), C(typo.CARD_EDGE))
ELEMENT_COLOR = {"fire": colors.HexColor("#B5482B"), "earth": colors.HexColor("#5B7A36"),
                 "air": colors.HexColor("#B08A1E"), "water": colors.HexColor("#2E6A9A")}
FLOW, TENSE = colors.HexColor("#3F6FB5"), colors.HexColor("#C0453A")

BODY = typo.font("nunito", 400, 12)
BOLD = typo.font("nunito", 700, 12)
SEMI = typo.font("nunito", 600, 12)
HEAD = typo.font("marcellus")
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont  # noqa: E402

# DejaVu Sans has every chart glyph (Noto Sans Symbols lacks the Sun, retrograde and Fortune marks).
pdfmetrics.registerFont(TTFont("DejaVuSans", str(HERE / "fonts" / "DejaVuSans.ttf")))
SYM = "DejaVuSans"
# Noto Sans Runic (SIL OFL) for the birth rune glyph; the other fonts have no runes.
pdfmetrics.registerFont(TTFont("NotoSansRunic", str(HERE / "fonts" / "NotoSansRunic-Regular.ttf")))
RUNE_FONT = "NotoSansRunic"
pdfmetrics.registerFontFamily(BODY, normal=BODY, bold=BOLD, italic=BODY, boldItalic=BOLD)

GLYPH = {"Sun": "☉", "Moon": "☽", "Mercury": "☿", "Venus": "♀", "Mars": "♂", "Jupiter": "♃",
         "Saturn": "♄", "Uranus": "♅", "Neptune": "♆", "Pluto": "♇", "Chiron": "⚷",
         "NorthNode": "☊", "SouthNode": "☋", "Lilith": "⚸", "Fortune": "⊗", "Vertex": "Vx",
         "Ascendant": "AC", "MC": "MC", "Midheaven": "MC"}
SIGN_GLYPH = dict(zip(LIB["sign"], "♈♉♊♋♌♍♎♏♐♑♒♓"))
SIGNS = list(LIB["sign"])

# Body text is 13 pt; every other size is the V2 size (12 pt body) scaled by 13/12.
Z = 13 / 12
S = {
    "body": ParagraphStyle("body", fontName=BODY, fontSize=13, leading=19, textColor=INK,
                           spaceAfter=5),
    "ask": ParagraphStyle("ask", fontName=BODY, fontSize=13, leading=19, textColor=INK,
                          spaceBefore=2, spaceAfter=6, leftIndent=8, borderPadding=0),
    "small": ParagraphStyle("small", fontName=BODY, fontSize=9.5 * Z, leading=13.5 * Z, textColor=MUTED),
    "label": ParagraphStyle("label", fontName=BOLD, fontSize=8 * Z, leading=11 * Z, textColor=GOLD),
    "cell": ParagraphStyle("cell", fontName=BODY, fontSize=10.5 * Z, leading=14 * Z, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName=SEMI, fontSize=10.5 * Z, leading=14 * Z, textColor=INK),
    # Headings, sub-titles and kickers always stay on the same page as the text after them.
    "h1": ParagraphStyle("h1", fontName=HEAD, fontSize=24 * Z, leading=30 * Z, textColor=INK, spaceAfter=4,
                         keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName=HEAD, fontSize=15.5 * Z, leading=20 * Z, textColor=INK,
                         spaceBefore=8, spaceAfter=3, keepWithNext=1),
    "h3": ParagraphStyle("h3", fontName=SEMI, fontSize=13.5, leading=18, textColor=INK, spaceBefore=6,
                         spaceAfter=2, keepWithNext=1),
    "sub": ParagraphStyle("sub", fontName=BODY, fontSize=11 * Z, leading=15 * Z, textColor=GOLD, spaceAfter=4,
                          keepWithNext=1),
    "kicker": ParagraphStyle("kicker", fontName=BOLD, fontSize=8.5 * Z, leading=12 * Z, textColor=GOLD,
                             spaceAfter=2, keepWithNext=1),
}


def sym(text, size=None):
    s = f' size="{size}"' if size else ""
    return f'<font name="{SYM}"{s}>{escape(text)}</font>'


class Report:
    def __init__(self, facts, content):
        self.f = facts
        self.it = facts["items"]
        self.sec = {s["id"]: s["sentences"] for s in content["sections"]}

    def text(self, sid):
        return " ".join(s["text"] for s in self.sec.get(sid, []))

    def para(self, sid, style="body"):
        """Short paragraphs of 2 sentences (easier to read); questions get their own line."""
        out, chunk = [], []
        for s in self.sec.get(sid, []):
            if s["text"].startswith("A question to keep"):
                q = s["text"].split(":", 1)[1].strip()
                if chunk:
                    out.append(Paragraph(escape(" ".join(chunk)), S[style]))
                    chunk = []
                out.append(Paragraph(f'<font color="{GOLD.hexval()}"><b>Ask yourself:</b></font> {escape(q)}',
                                     S["ask"]))
                continue
            chunk.append(s["text"])
            if len(chunk) == 2:
                out.append(Paragraph(escape(" ".join(chunk)), S[style]))
                chunk = []
        if chunk:
            out.append(Paragraph(escape(" ".join(chunk)), S[style]))
        return out

    def placement(self, key):
        """(sign, degree, house, retro) for a worksheet row key."""
        g = lambda k: self.it.get(f"{key}.{k}", "")  # noqa: E731
        return g("sign"), g("degree"), g("house"), g("retro")


# ---------- chart wheel ----------
class Wheel(Flowable):
    def __init__(self, facts, size):
        super().__init__()
        self.f, self.size = facts, size
        self.width = self.height = size

    def pos(self, lon, r):
        a = math.radians(180 + (lon - self.asc))
        return self.cx + r * math.cos(a), self.cy + r * math.sin(a)

    def draw(self):
        c = self.canv
        lons = self.f["lons"]
        self.asc = lons["Ascendant"]
        self.cx = self.cy = self.size / 2
        R = self.size / 2 - 2
        r_sign, r_house, r_planet, r_inner = R * 0.84, R * 0.70, R * 0.60, R * 0.47
        c.setLineWidth(0.6)
        c.setStrokeColor(INK)
        c.setFillColor(colors.white)
        c.circle(self.cx, self.cy, R, fill=1)
        # sign ring, coloured by element
        for i, sign in enumerate(SIGNS):
            el = LIB["sign"][sign]["element"]
            c.setFillColor(ELEMENT_COLOR[el].clone(alpha=0.13))
            p = c.beginPath()
            steps = 12
            for k in range(steps + 1):
                p.lineTo(*self.pos(i * 30 + 30 * k / steps, R)) if k else p.moveTo(*self.pos(i * 30, R))
            for k in range(steps, -1, -1):
                p.lineTo(*self.pos(i * 30 + 30 * k / steps, r_sign))
            p.close()
            c.drawPath(p, stroke=0, fill=1)
            c.setStrokeColor(GRID)
            c.line(*self.pos(i * 30, R), *self.pos(i * 30, r_inner))
            x, y = self.pos(i * 30 + 15, (R + r_sign) / 2)
            c.setFillColor(ELEMENT_COLOR[el])
            c.setFont(SYM, self.size * 0.042)
            c.drawCentredString(x, y - self.size * 0.014, SIGN_GLYPH[sign])
            # whole sign house number
            house = (i - int(self.asc // 30)) % 12 + 1
            x, y = self.pos(i * 30 + 15, (r_sign + r_house) / 2)
            c.setFillColor(MUTED)
            c.setFont(BODY, self.size * 0.026)
            c.drawCentredString(x, y - self.size * 0.009, str(house))
        c.setStrokeColor(INK)
        for r in (R, r_sign, r_house, r_inner):
            c.circle(self.cx, self.cy, r, fill=0)
        # aspect lines (major only, planets only)
        bodies = list(GLYPH)[:10]
        for a in self.f["aspects"]:
            if a["a"] not in bodies or a["b"] not in bodies or a["type"] not in (
                    "sextile", "trine", "square", "opposition"):
                continue
            c.setStrokeColor(FLOW if a["type"] in ("sextile", "trine") else TENSE)
            c.setLineWidth(0.7)
            c.line(*self.pos(lons[a["a"]], r_inner), *self.pos(lons[a["b"]], r_inner))
        # AC and MC axes
        c.setLineWidth(1.3)
        c.setStrokeColor(INK)
        for key, label in (("Ascendant", "AC"), ("MC", "MC")):
            lon = lons[key]
            c.line(*self.pos(lon, r_inner), *self.pos(lon, R + 1))
            c.line(*self.pos(lon + 180, r_inner), *self.pos(lon + 180, r_house))
            x, y = self.pos(lon, r_inner * 0.86)
            c.setFillColor(INK)
            c.setFont(BOLD, self.size * 0.025)
            c.drawCentredString(x, y - 3, label)
        # planet glyphs, spread out when crowded
        pts = sorted(((lons[b], b) for b in list(GLYPH)[:11] + ["NorthNode"]), key=lambda t: t[0])
        placed = []
        gap = 8.5
        for lon, b in pts:
            show = lon
            if placed and (show - placed[-1][0]) % 360 < gap:
                show = placed[-1][0] + gap
            placed.append((show, b, lon))
        for show, b, lon in placed:
            c.setStrokeColor(MUTED)
            c.setLineWidth(0.4)
            c.line(*self.pos(lon, r_house), *self.pos(lon, r_house - 4))
            x, y = self.pos(show, r_planet)
            c.setFillColor(INK)
            c.setFont(SYM, self.size * 0.04)
            c.drawCentredString(x, y - self.size * 0.013, GLYPH[b])


# ---------- page furniture ----------
def on_page(c, doc):
    c.saveState()
    c.setFillColor(PAPER)
    c.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    if doc.page > 1:
        c.setStrokeColor(EDGE)
        c.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
        c.setFont(BODY, 8)
        c.setFillColor(MUTED)
        c.drawString(18 * mm, 9.5 * mm, f"cosmic_universum · Birth chart report for {doc.reader} · Personal use only")
        c.drawRightString(A4[0] - 18 * mm, 9.5 * mm, str(doc.page))
    c.restoreState()


def card(flowables, color=EDGE, bg=colors.white, pad=9):
    t = Table([[flowables]], colWidths=[A4[0] - 36 * mm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.7, color), ("BACKGROUND", (0, 0), (-1, -1), bg),
                           ("LEFTPADDING", (0, 0), (-1, -1), pad), ("RIGHTPADDING", (0, 0), (-1, -1), pad),
                           ("TOPPADDING", (0, 0), (-1, -1), pad), ("BOTTOMPADDING", (0, 0), (-1, -1), pad)]))
    return t


def grid(rows, widths, head=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.4, GRID), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
          ("BACKGROUND", (0, 0), (-1, -1), colors.white)]
    if head:
        st += [("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white)]
    t.setStyle(TableStyle(st))
    return t


def P(text, style="cell"):
    return Paragraph(text, S[style])


def H(text):
    return Paragraph(f'<font color="white">{escape(text)}</font>', S["label"])


def key_strip(planet_means, sign, house):
    """The three formula pieces next to each other (planet + sign + house)."""
    cols = [("WHAT (PLANET)", planet_means)] if planet_means else []
    if sign:
        cols.append((f"HOW ({sign.upper()})", LIB["sign"][sign]["keywords"]))
    if house:
        h = LIB["house"][str(house)]
        cols.append((f"WHERE ({ORD(int(house)).upper()} HOUSE)", f"{h['area']}: {h['detail']}"))
    w = (A4[0] - 36 * mm) / len(cols)
    t = Table([[[P(escape(a), "label"), P(escape(b), "small")] for a, b in cols]], colWidths=[w] * len(cols))
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F3EFE6")),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEAFTER", (0, 0), (-2, -1), 0.5, EDGE),
                           ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


# The Big Three chapter: the Sun, Moon and Rising each answer the 'why am I like this' questions they own.
BIG_THREE = [("Sun", "Who you are, and the person you are growing into",
              [("why.who", "Who am I?"), ("why.drives", "What drives me?")]),
             ("Moon", "Your feelings, and what makes you feel safe",
              [("why.needs", "What do I need around me to feel good and safe?"),
               ("why.drains", "What makes me feel bad?")]),
             ("Rising", "Your approach to life, and how others first see you",
              [("why.approach", "How do I meet life?")])]
LIKES_QUESTIONS = [("why.likes", "What do I like, and what pulls me in?"), ("why.dislikes", "What do I not like?")]
LOVE_QUESTIONS = [("love.needs", "What do I need in love?"), ("love.draws", "Who am I drawn to?")]
WORK_QUESTIONS = [("work.suits", "What work suits me?"), ("work.daily", "How do I like to work day to day?")]


def chapter_break():
    """A new chapter starts on a new page only when less than CHAPTER_ROOM is left (no half-empty pages)."""
    return [CondPageBreak(CHAPTER_ROOM), Spacer(1, 8 * mm)]


CHAPTER_ROOM = 90 * mm


def reduce_chain(n):
    """[14, 5] or [1990, 19, 10, 1]: each step of adding the digits (11, 22 and 33 stay)."""
    out = [n]
    while out[-1] > 9 and out[-1] not in (11, 22, 33):
        out.append(sum(int(c) for c in str(out[-1])))
    return out


def chain_text(chain):
    return f" {sym('→')} ".join(str(x) for x in chain)


def day_month(mmdd):
    m, d = (int(x) for x in mmdd.split("-"))
    return f"{d} {MONTHS[m - 1]}"
MAJOR_TENSE = ("square", "opposition")
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]


def keep_heads(story):
    """Join headings (keepWithNext) to a KeepTogether block after them.

    reportlab keeps a heading with a plain paragraph, but not with a KeepTogether block, so a heading
    could end a page while its block moved on to the next one."""
    out, run = [], []
    for f in story:
        if getattr(getattr(f, "style", None), "keepWithNext", 0):
            run.append(f)
            continue
        if run and isinstance(f, KeepTogether):
            f = KeepTogether(run + list(f._content))
        else:
            out += run
        run = []
        out.append(f)
    return out + run


def red_lines(facts):
    """The tense major aspects the wheel draws in red (planets only)."""
    bodies = list(GLYPH)[:10]
    return [a for a in facts["aspects"] if a["type"] in MAJOR_TENSE and a["a"] in bodies and a["b"] in bodies]


def month_year(iso):
    y, m, _ = iso.split("-")
    return f"{MONTHS[int(m) - 1]} {y}"


def build(facts, content, out):
    r = Report(facts, content)
    it, inp = r.it, facts["input"]
    W = A4[0] - 36 * mm
    story = []

    # ----- cover -----
    story += [Spacer(1, 26 * mm),
              Paragraph("COSMIC_UNIVERSUM · BIRTH CHART REPORT", ParagraphStyle(
                  "k", parent=S["kicker"], alignment=TA_CENTER, fontSize=9 * Z)),
              Paragraph(f"{escape(inp['name'])}'s birth chart", ParagraphStyle(
                  "t", parent=S["h1"], alignment=TA_CENTER, fontSize=32 * Z, leading=40 * Z)),
              Paragraph(f"{escape(it['birthDate'])} · {escape(inp['time'])} · {escape(inp['place'])}",
                        ParagraphStyle("c", parent=S["body"], alignment=TA_CENTER, textColor=MUTED)),
              Spacer(1, 8 * mm)]
    wheel = Wheel(facts, 120 * mm)
    wt = Table([[wheel]], colWidths=[W])
    wt.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story += [wt, Spacer(1, 8 * mm)]
    big = [[P(f'{sym(GLYPH["Sun"], 17)}<br/><b>Sun in {it["bigThree.sun"]}</b>', "cellb"),
            P(f'{sym(GLYPH["Moon"], 17)}<br/><b>Moon in {it["bigThree.moon"]}</b>', "cellb"),
            P(f'<font size="14"><b>AC</b></font><br/><b>Rising in {it["bigThree.rising"]}</b>', "cellb")]]
    bt = Table(big, colWidths=[W / 3] * 3)
    bt.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("BOX", (0, 0), (-1, -1), 0.7, EDGE),
                            ("LINEAFTER", (0, 0), (-2, -1), 0.5, EDGE), ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                            ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    for row in big[0]:
        row.style = ParagraphStyle("cc", parent=S["cellb"], alignment=TA_CENTER, fontSize=11 * Z, leading=17 * Z)
    story += [bt, NextPageTemplate("main"), PageBreak()]

    # ----- start here -----
    story += [Paragraph("Start here", S["h1"]), *r.para("intro"), Spacer(1, 5 * mm),
              Paragraph("How each reading works", S["h2"]),
              Paragraph("Each reading has three pieces: the planet, the sign and the house. The planet shows <b>what</b> part of you it is about. "
                        "The sign shows <b>how</b> it acts. The house shows <b>where</b> in life you feel it. "
                        "You see the "
                        "three pieces in a strip above each reading, so you never have to look them up.",
                        S["body"]),
              Spacer(1, 5 * mm), Paragraph("Your birth data", S["h2"])]
    off = inp["utcOffsetHours"]
    utc_time = inp["utc"][11:16]
    rows = [[H("WHAT"), H("VALUE")],
            [P("Name"), P(escape(inp["name"]))],
            [P("Birth date"), P(escape(it["birthDate"]))],
            [P("Birth time"), P(f"{inp['time']} local time (UTC{'+' if off >= 0 else ''}{off:g}), "
                                f"which is {utc_time} UTC")],
            [P("Birth place"), P(f"{escape(inp['place'])} ({inp['lat']:.2f}° N, {inp['lon']:.2f}° E)")],
            [P("Time zone"), P(escape(inp["tz"]))],
            [P("Zodiac"), P("Tropical")],
            [P("House system"), P("Whole Sign (each house is exactly one sign)")],
            [P("Planet positions"), P("Computed from NASA JPL DE440s data by cosmicuniversum.com/tools")],
            [P("Nodes and Lilith"), P("Mean North Node; mean Black Moon Lilith")]]
    story += [grid(rows, [38 * mm, W - 38 * mm]),
              Paragraph("Keep this page. Other chart tools ask for the same data. If your birth time "
                        "changes, the Rising sign, houses and points can change too.", S["small"]),
              PageBreak()]

    # ----- big three: why you are like this -----
    def answer(sid, question, skip=(), lead=()):
        why = reason_line([ref for s in r.sec.get(sid, []) for ref in s.get("src", [])], facts, skip)
        return KeepTogether([*lead, Paragraph(escape(question), S["h3"]), *r.para(sid),
                             *([Paragraph(f"<b>From your chart:</b> {escape(why)}", S["small"])] if why else []),
                             Spacer(1, 2 * mm)])

    story += [Paragraph("Your Big Three", S["h1"]),
              Paragraph("Your Sun, Moon and Rising sign are the core of your chart. Together they answer "
                        "why you are like this.", S["small"])]
    ruler = facts["chartRuler"]
    ruler_block = KeepTogether([
        Spacer(1, 3 * mm),
        Paragraph(f"{sym(GLYPH[ruler['traditional']], 16)}  Your chart ruler: {ruler['traditional']}", S["h2"]),
        *[Paragraph(escape(t), S["body"]) for t in RULER_STEPS(ruler["risingSign"], ruler["traditional"],
                                                               ruler["sign"], ruler["house"])],
        key_strip(LIB["planet"][ruler["traditional"]]["means"], ruler["sign"], ruler["house"]),
        Spacer(1, 2 * mm), *r.para("chartRuler")])
    stepped = set()
    for body, subtitle, questions in BIG_THREE:
        sign = it["bigThree.rising"] if body == "Rising" else it[f"{body.lower()}.sign"]
        house = None if body == "Rising" else it[f"{body.lower()}.house"]
        g = "<b>AC</b>" if body == "Rising" else sym(GLYPH[body], 16)
        # The heading, sub-title and strip travel with the first answer, so they never end a page.
        lead = [Spacer(1, 3 * mm), Paragraph(f"{g}  {escape(body)} in {escape(sign)}", S["h2"]),
                Paragraph(escape(subtitle), S["sub"]), key_strip(None, sign, house), Spacer(1, 1 * mm)]
        story += [answer(sid, q, (f"{body} in ",), lead if n == 0 else ()) for n, (sid, q) in enumerate(questions)]
        if sign not in stepped:  # the same sign twice would print the same step twice
            stepped.add(sign)
            story.append(Paragraph(f'<font color="{GOLD.hexval()}"><b>Try this week:</b></font> '
                                   f'{escape(LIB["sign"][sign]["step"])}', S["ask"]))
        if body == "Rising":
            story.append(ruler_block)  # the chart ruler comes from the Rising sign
    story += [Spacer(1, 3 * mm), Paragraph("What you like, and what you do not", S["h2"])]
    story += [answer(sid, q) for sid, q in LIKES_QUESTIONS]
    story += chapter_break()

    # ----- love and work -----
    house7, house6 = facts["houseSigns"]["7"], facts["houseSigns"]["6"]
    story += [Paragraph("Love and work", S["h1"]),
              Paragraph("What your own chart says about love and work. It does not need anyone else's chart.",
                        S["small"])]
    love_lead = [Spacer(1, 3 * mm), Paragraph(f"{sym(GLYPH['Venus'], 16)}  Love: what you need", S["h2"]),
                 key_strip(None, it["venus.sign"], it["venus.house"]), Spacer(1, 1 * mm)]
    story += [answer("love.needs", LOVE_QUESTIONS[0][1], ("Venus in ",), love_lead),
              answer("love.draws", LOVE_QUESTIONS[1][1], (), [key_strip(None, house7, 7), Spacer(1, 1 * mm)])]
    work_lead = [Spacer(1, 3 * mm), Paragraph("<b>MC</b>  Work: what suits you", S["h2"]),
                 key_strip(None, facts["midheaven"].split()[-1], facts["midheavenWholeSignHouse"]),
                 Spacer(1, 1 * mm)]
    story += [answer("work.suits", WORK_QUESTIONS[0][1], (), work_lead),
              answer("work.daily", WORK_QUESTIONS[1][1], (), [key_strip(None, house6, 6), Spacer(1, 1 * mm)]),
              *chapter_break()]

    # ----- birth rune -----
    br = facts["birthRune"]
    rl = LIB["rune"][br["rune"]]
    centre = lambda st: ParagraphStyle(f"c{st}", parent=S[st], alignment=TA_CENTER)  # noqa: E731
    # The head of each new chapter (title down to the meaning table) is one block: it never splits.
    head = [Paragraph("Your birth rune", S["h1"]),
            Paragraph(f'<font name="{RUNE_FONT}" size="64">{rl["glyph"]}</font>',
                      ParagraphStyle("glyph", parent=S["body"], alignment=TA_CENTER, leading=80)),
            Paragraph(escape(br["rune"]), centre("h2")),
            Paragraph(f"Born {day_month(br['from'])} to {day_month(br['to'])}", centre("kicker")),
            Spacer(1, 2 * mm),
            Paragraph("Your birth rune comes from a modern runic calendar by Nigel Pennick (20th century). "
                      "It gives each of the 24 old runes about 15 days of the year, starting with Fehu on "
                      "29 June.", S["small"])]
    if br["edge"]:
        head.append(Paragraph(f"You were born on a day where calendars differ. Some give you "
                              f"{' or '.join(br['edge']['other'])}.", S["small"]))
    meaning = [[P("<b>What it means</b>"), P(escape(rl["means"]))], [P("<b>Its gift</b>"), P(escape(rl["gift"]))],
               [P("<b>Its shadow</b>"), P(escape(rl["shadow"]))]]
    story += [KeepTogether(head + [Spacer(1, 3 * mm), grid(meaning, [38 * mm, W - 38 * mm], head=False)]),
              Spacer(1, 3 * mm), *r.para("rune"),
              KeepTogether([Paragraph("How to work with your rune", S["h2"]),
                            Paragraph("Small habits that keep your rune in mind. Use the ones that feel right.",
                                      S["small"]),
                            *[Paragraph(f"· {escape(x)}", ParagraphStyle("pr", parent=S["body"], leftIndent=4 * mm))
                              for x in rl["practice"]]]),
              *chapter_break()]

    # ----- life path number -----
    lp = facts["lifePath"]
    ll = LIB["lifePath"][str(lp["number"])]
    st = lp["steps"]
    y, m, d = (int(x) for x in inp["date"].split("-"))
    sums = grid([[P(f"Month: {chain_text(reduce_chain(m))}"), P(f"Day: {chain_text(reduce_chain(d))}"),
                  P(f"Year: {chain_text(reduce_chain(y))}")],
                 [P(f"<b>{st['month']} + {st['day']} + {st['year']} = {chain_text(reduce_chain(lp['sum']))}</b>"),
                  "", ""]], [W / 3] * 3, head=False)
    sums.setStyle(TableStyle([("SPAN", (0, 1), (-1, 1))]))  # the sum line runs across the whole table
    head = [Paragraph("Your life path number", S["h1"]),
            Paragraph(f'<font name="{HEAD}" size="60">{lp["number"]}</font>',
                      ParagraphStyle("num", parent=S["body"], alignment=TA_CENTER, leading=70)),
            Spacer(1, 2 * mm),
            Paragraph("Numerology adds up the numbers of your birth date. Month, day and year are each added "
                      "up to one digit, then added together. 11, 22 and 33 stay as they are. Other websites "
                      "may add all the digits at once and get a different number.", S["small"]),
            Spacer(1, 2 * mm), sums]
    if "master" in ll:
        head += [Spacer(1, 2 * mm), Paragraph(escape(ll["master"]), S["body"])]
    meaning = [[P("<b>What it means</b>"), P(escape(ll["means"]))], [P("<b>Its gift</b>"), P(escape(ll["gift"]))],
               [P("<b>Its shadow</b>"), P(escape(ll["shadow"]))]]
    story += [KeepTogether(head + [Spacer(1, 3 * mm), grid(meaning, [38 * mm, W - 38 * mm], head=False)]),
              Spacer(1, 3 * mm), *r.para("lifePath")]

    # ----- where they agree -----
    who = {"sun": f"Sun in {it['sun.sign']}", "rune": br["rune"], "number": f"life path {lp['number']}"}
    agree = [Paragraph("Where they agree", S["h2"]),
             Paragraph("Your Sun sign, your rune and your number come from three separate systems. "
                       "Here is what at least two of them share.", S["small"])]
    if facts["agree"]:
        agree.append(grid([[P(f"<b>{escape(LIB['theme'][a['theme']])}</b>"),
                            P(escape(" · ".join(who[k] for k in a["by"])))] for a in facts["agree"]],
                          [W / 2] * 2, head=False))
    else:
        agree.append(Paragraph("Your Sun, your rune and your number each show a different side of you.", S["body"]))
    story += [Spacer(1, 4 * mm), KeepTogether(agree), Spacer(1, 2 * mm), *r.para("agree"), PageBreak()]

    # ----- chart at a glance -----
    story += [Paragraph("Your chart at a glance", S["h1"]),
              Paragraph("Read the wheel anticlockwise from AC, your Rising sign, on the left. "
                        "Small numbers are houses. Blue lines join planets that work well together. "
                        "Red lines join planets that want different things. You feel a red line as an "
                        "inner push and pull.", S["small"]), Spacer(1, 2 * mm)]
    wt2 = Table([[Wheel(facts, 62 * mm)]], colWidths=[W])
    wt2.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story += [wt2, Spacer(1, 3 * mm)]
    rows = [[H("PLANET / POINT"), H("SIGN"), H("DEGREE"), H("HOUSE"), H("RETRO")]]
    order = [("Sun", "sun"), ("Moon", "moon"), ("Mercury", "mercury"), ("Venus", "venus"),
             ("Mars", "mars"), ("Jupiter", "jupiter"), ("Saturn", "saturn"), ("Uranus", "uranus"),
             ("Neptune", "neptune"), ("Pluto", "pluto"), ("Chiron", "chiron"),
             ("NorthNode", "northNode"), ("SouthNode", "southNode"), ("Lilith", "lilith"),
             ("Fortune", "partOfFortune"), ("Vertex", "vertex")]
    names = {"NorthNode": "North Node", "SouthNode": "South Node", "Lilith": "Black Moon Lilith",
             "Fortune": "Part of Fortune"}
    for body, key in order:
        sg, dg, hs, rt = r.placement(key)
        rows.append([P(f"{sym(GLYPH[body])} {names.get(body, body)}"), P(f"{sym(SIGN_GLYPH[sg])} {sg}"),
                     P(dg), P(hs), P(sym(rt) if rt else "")])
    asc_deg, asc_sign = facts["ascendant"].split()
    mc_deg, mc_sign = facts["midheaven"].split()
    rows.append([P("AC Ascendant"), P(f"{sym(SIGN_GLYPH[asc_sign])} {asc_sign}"), P(asc_deg), P("1"), P("")])
    rows.append([P("MC Midheaven"), P(f"{sym(SIGN_GLYPH[mc_sign])} {mc_sign}"), P(mc_deg),
                 P(str(facts["midheavenWholeSignHouse"])), P("")])
    # The legend sits above the table, so it can never slip onto the next page alone.
    story.append(KeepTogether([
        Paragraph(f"{sym('℞')} = retrograde. Degree = the exact spot inside the sign, from 0° to 29°. "
                  "You do not need the degree for the readings.", S["small"]), Spacer(1, 1 * mm),
        grid(rows, [52 * mm, 42 * mm, 26 * mm, 26 * mm, W - 146 * mm])]))
    reds = red_lines(facts)
    if reds:
        # One card per red line, so a chart with many red lines can run over to the next page.
        story += [Spacer(1, 4 * mm), Paragraph("Where you pull two ways", S["h2"]),
                  Paragraph("Each red line in your wheel, in plain words:", S["small"])]
        for a in reds:
            lines = [Paragraph(f'<font color="{TENSE.hexval()}">{sym("●")}</font> '
                               f'<b>{escape(fill_aspect(a["a"], a["type"], a["b"]))}</b>', S["body"])]
            examples = tension_examples(a["a"], a["b"])
            if examples:
                lines.append(Paragraph("In real life, this can look like:", S["small"]))
                lines += [Paragraph(f"· {escape(ex)}", ParagraphStyle("ex", parent=S["body"], leftIndent=4 * mm))
                          for ex in examples]
            story += [card(lines, color=TENSE, bg=colors.HexColor("#FFF8F6"), pad=8), Spacer(1, 2 * mm)]
        story += r.para("clash")
    story.append(PageBreak())

    # ----- planets -----
    story += [Paragraph("Your planets", S["h1"]),
              Paragraph("Your Sun and Moon are in the Big Three. Here are the others.", S["small"])]
    for body, key in order[2:11]:
        sg, dg, hs, rt = r.placement(key)
        means = LIB["planet"][body]["means"] if body in LIB["planet"] else LIB["point"][body]["means"]
        extra = " · retrograde" if rt else ""
        story.append(KeepTogether([
            Paragraph(f"{sym(GLYPH[body], 16)}  {body} in {sg}", S["h2"]),
            Paragraph(f"{dg} {sg} · {ORD(int(hs))} house{escape(extra)}", S["kicker"]),
            key_strip(means, sg, hs), Spacer(1, 2 * mm), *r.para(f"planet.{body}"), Spacer(1, 3 * mm)]))
    story.append(PageBreak())

    # ----- points -----
    story += [Paragraph("Special points", S["h1"]),
              Paragraph("These points are worked out with maths. They add detail to your Big Three.", S["small"])]
    for body, key, sid in (("NorthNode", "northNode", "point.NorthNode"), ("SouthNode", "southNode", "point.SouthNode"),
                           ("Lilith", "lilith", "point.Lilith"), ("Fortune", "partOfFortune", "point.Fortune"),
                           ("Vertex", "vertex", "point.Vertex")):
        sg, dg, hs, _ = r.placement(key)
        story.append(KeepTogether([
            Paragraph(f"{sym(GLYPH[body], 16) if body != 'Vertex' else '<b>Vx</b>'}  {names.get(body, body)} in {sg}",
                      S["h2"]),
            Paragraph(f"{dg} {sg} · {ORD(int(hs))} house", S["kicker"]),
            key_strip(LIB["point"][body]["means"], sg, hs), Spacer(1, 2 * mm), *r.para(sid), Spacer(1, 3 * mm)]))
    story.append(KeepTogether([
        Paragraph(f"<b>MC</b>  Midheaven in {mc_sign}", S["h2"]),
        Paragraph(f"{mc_deg} {mc_sign} · {ORD(facts['midheavenWholeSignHouse'])} house", S["kicker"]),
        key_strip(LIB["point"]["Midheaven"]["means"], mc_sign, facts["midheavenWholeSignHouse"]),
        Spacer(1, 2 * mm), *r.para("point.Midheaven")]))
    story.append(PageBreak())

    # ----- balance, phase, retrograde, angles -----
    story += [Paragraph("Your balance", S["h1"])]
    el_rows = [[H("ELEMENT"), H("COUNT"), H("WHAT IT IS")]]
    for el in ("fire", "earth", "air", "water"):
        n = int(it[f"balance.{el}"])
        el_rows.append([P(f'<font color="{ELEMENT_COLOR[el].hexval()}"><b>{el.capitalize()}</b></font>'),
                        P(f'<font color="{ELEMENT_COLOR[el].hexval()}">{sym("●" * n)}</font>  {n}'),
                        P(escape(LIB["element"][el]["means"]))])
    md_rows = [[H("MODE"), H("COUNT"), H("WHAT IT DOES")]]
    for md in ("cardinal", "fixed", "mutable"):
        md_rows.append([P(f"<b>{md.capitalize()}</b>"), P(it[f"balance.{md}"]), P(escape(LIB["mode"][md]["means"]))])
    story += [grid(el_rows, [30 * mm, 40 * mm, W - 70 * mm]), Spacer(1, 2 * mm),
              grid(md_rows, [30 * mm, 40 * mm, W - 70 * mm]),
              Paragraph("Counted: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn and the Ascendant (8 in all).",
                        S["small"]),
              Spacer(1, 3 * mm), *r.para("balance"), Spacer(1, 4 * mm),
              KeepTogether([Paragraph(f"Moon phase: {it['moonPhase']}", S["h2"]), *r.para("moonPhase")]),
              Spacer(1, 3 * mm),
              KeepTogether([Paragraph(f"Retrograde planets {sym('℞')}", S["h2"]), *r.para("retrograde")]),
              Spacer(1, 3 * mm),
              KeepTogether([Paragraph("Planets near an angle", S["h2"]), *r.para("angles")]),
              PageBreak()]

    # ----- aspects -----
    story += [Paragraph("Your aspects", S["h1"]),
              Paragraph("An aspect is an angle between two planets. It shows which parts of you get along "
                        "and which ones clash. The orb is how far from exact it is. Smaller means stronger.",
                        S["small"])]
    for n, sid in ((1, "aspect.1"), (2, "aspect.2"), (3, "aspect.3")):
        a, t, b, o = (it[f"aspect{n}.{k}"] for k in ("planetA", "aspect", "planetB", "orb"))
        story.append(KeepTogether([
            Paragraph(f"{sym(GLYPH[a], 15)} {a} {t.lower()} {sym(GLYPH[b], 15)} {b}", S["h2"]),
            Paragraph(f"Orb {o} · {LIB['aspect'][t.lower()]['keyword']}", S["kicker"]),
            *r.para(sid), Spacer(1, 2 * mm)]))
    if "aspect.extra" in r.sec:
        story.append(KeepTogether([Paragraph("Also worth knowing", S["h2"]), *r.para("aspect.extra")]))
    story += [CondPageBreak(60 * mm), Paragraph("All your aspects", S["h2"]),
              Paragraph("Each row joins two parts of you. Read the last column as a sentence. "
                        "The smaller the orb, the more you feel it.", S["small"]), Spacer(1, 2 * mm)]
    rows = [[H("PLANET A"), H("ASPECT"), H("PLANET B"), H("ORB"), H("WHAT IT MEANS")]]
    for a in facts["aspects"]:
        lib = LIB["aspect"][a["type"]]
        tense = lib["nature"] in ("tense", "awkward")
        col = TENSE.hexval() if tense else FLOW.hexval() if lib["nature"] == "flowing" else INK.hexval()
        rows.append([P(a["a"]), P(f'<font color="{col}">{a["type"]}</font>'), P(a["b"]), P(f"{a['orb']:.1f}°"),
                     P(escape(fill_aspect(a["a"], a["type"], a["b"])))])
    story += [grid(rows, [27 * mm, 30 * mm, 27 * mm, 15 * mm, W - 99 * mm]), PageBreak()]

    # ----- for later -----
    story += [Paragraph("For later", S["h1"]), Paragraph("Questions to keep", S["h2"]),
              Paragraph("Come back to these when you want to think about your chart.", S["small"])]
    qs = [("Sun in " + it["sun.sign"], LIB["sign"][it["sun.sign"]]["ask"]),
          ("Moon in " + it["moon.sign"], LIB["sign"][it["moon.sign"]]["ask"]),
          ("Rising in " + it["bigThree.rising"], LIB["sign"][it["bigThree.rising"]]["ask"]),
          ("North Node in " + it["northNode.sign"], LIB["sign"][it["northNode.sign"]]["ask"]),
          ("North Node in the " + ORD(int(it["northNode.house"])) + " house",
           LIB["house"][it["northNode.house"]]["question"])]
    story.append(grid([[P(f"<b>{escape(a)}</b>"), P(escape(b))] for a, b in qs], [55 * mm, W - 55 * mm], head=False))
    sat = f"{it['saturn.degree']} {it['saturn.sign']}"
    sr = LIB["nextSteps"]["saturnReturn"]
    story += [Paragraph("Dates to watch: your Saturn return", S["h2"]),
              Paragraph(f"{escape(sr['text'])} Your Saturn is at {sat}. {escape(sr['practical'])}", S["body"])]
    rows = [[P(f"<b>Saturn return {x['n']}:</b> {month_year(x['first'])}"
               + (f" to {month_year(x['last'])}" if x["last"][:7] != x["first"][:7] else "")),
             P(f"age {x['ageStart']}"), P(x["status"])] for x in facts.get("saturnReturns", [])]
    if rows:
        story += [grid(rows, [W - 60 * mm, 30 * mm, 30 * mm], head=False), Spacer(1, 2 * mm)]
    story += r.para("saturnReturn")
    empty = ", ".join(str(h) for h in facts["emptyHouses"])
    story += [Paragraph("Empty houses", S["h2"]),
              Paragraph(f"Houses {empty} have no planets in your chart. An empty house is normal. "
                        "It doesn't mean that part of your life is missing.", S["body"]),
              Paragraph("Words you may meet", S["h2"])]
    gl = [("Aspect", "an angle between two planets."), ("Big Three", "your Sun, Moon and Rising signs."),
          ("Chart ruler", "the planet that rules your Rising sign."), ("Cusp", "the starting edge of a house or sign."),
          ("Orb", "how far from exact an aspect can be."),
          ("Retrograde", "a planet that appears to move backwards."),
          ("Stellium", "three or more planets in one sign or house."),
          ("Whole Sign houses", "each house is exactly one sign.")]
    story.append(grid([[P(f"<b>{escape(a)}</b>"), P(escape(b))] for a, b in gl], [40 * mm, W - 40 * mm], head=False))
    story += [Spacer(1, 6 * mm), Paragraph("About this report", S["h2"]),
              Paragraph("This report is for self-reflection and fun. It is not medical, legal, money or "
                        "life advice. Your choices are always your own.", S["small"]),
              Paragraph(f"Made on {date.today():%d %B %Y}. © cosmic_universum · For personal use only · "
                        "Not to be resold or shared.", S["small"])]

    doc = BaseDocTemplate(out, pagesize=A4, title=f"{inp['name']}'s birth chart", author="cosmic_universum",
                          leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=20 * mm)
    doc.reader = inp["name"]
    story = keep_heads(story)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate("cover", [frame], onPage=on_page),
                          PageTemplate("main", [frame], onPage=on_page)])
    doc.build(story)
    print("written:", out)


if __name__ == "__main__":
    f, c, o = sys.argv[1:4]
    build(json.loads(Path(f).read_text(encoding="utf-8")), json.loads(Path(c).read_text(encoding="utf-8")), o)
