"""Small content-stream editor for the ebook PDFs (pypdf only).

The ebook pages were printed by Chromium (Skia). Every page is one content
stream made of a few simple operators: paths (m l c re h + f/S/n, W/W* clips),
text blocks (BT Tm (Td Tf Tj)* ET) and graphics state (q Q cm rg RG gs).

This module splits a page into "units" (one path, one shown string, or one
state operator), works out where each unit lands on the page (in top-down
points, like PyMuPDF reports), and lets the build script:

* delete units in a rectangle (for example a footer page number),
* shift units in a rectangle up or down (for example the contents rows),
* duplicate units in a rectangle at an offset (one more contents row).

Coordinates: "top-down points", x from the left edge, y from the TOP edge of
the page, in PDF points. A rectangle is (x0, y0, x1, y1) in that space.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from pypdf.generic import ContentStream, FloatObject

PATH_BUILD = {b"m", b"l", b"c", b"v", b"y", b"re", b"h"}
PATH_PAINT = {b"S", b"s", b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"n"}
CLIP = {b"W", b"W*"}


def _mul(a, b):
    """Multiply 2D affine matrices [a b c d e f] (a then b)."""
    return [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5],
    ]


def _apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def _inv_linear(m, dx, dy):
    """Device vector (dx, dy) -> user-space vector for matrix m (linear part)."""
    det = m[0] * m[3] - m[1] * m[2]
    ux = (m[3] * dx - m[2] * dy) / det
    uy = (-m[1] * dx + m[0] * dy) / det
    return ux, uy


@dataclass
class Unit:
    kind: str  # "path", "text", "state"
    ops: list  # list of (operands, operator)
    bbox: tuple | None = None  # top-down points (x0, y0, x1, y1)
    ctm: list | None = None  # CTM at the unit (for shifting)
    clip: bool = False
    # for text units: index of the Tj op inside the BT block, see TextBlock
    extra: dict = field(default_factory=dict)


class PageEditor:
    """Parse one page; edit it; write it back with save()."""

    def __init__(self, page, reader, page_height: float):
        self.page = page
        self.reader = reader
        self.h = float(page_height)
        self._fonts = {}
        cs = ContentStream(page.get_contents(), reader)
        self.cs = cs
        self.units = self._parse(cs.operations)

    # ------------------------------------------------------------- unicode
    def _font_map(self, name):
        """(bytes per code, {code: unicode}) for a font resource name."""
        if name in self._fonts:
            return self._fonts[name]
        f = self.page["/Resources"]["/Font"][name].get_object()
        nbytes = 2 if f.get("/Subtype") == "/Type0" else 1
        m = {}
        tu = f.get("/ToUnicode")
        if tu is not None:
            data = tu.get_object().get_data().decode("latin1")
            for blk in re.findall(r"beginbfchar(.*?)endbfchar", data, re.S):
                for a, b in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
                    m[int(a, 16)] = bytes.fromhex(b).decode("utf-16-be")
            for blk in re.findall(r"beginbfrange(.*?)endbfrange", data, re.S):
                for a, b, c in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
                    start = int(c, 16)
                    for i, code in enumerate(range(int(a, 16), int(b, 16) + 1)):
                        m[code] = chr(start + i)
        self._fonts[name] = (nbytes, m)
        return self._fonts[name]

    def _decode(self, fontname, raw: bytes) -> str:
        nbytes, m = self._font_map(fontname)
        out = []
        for i in range(0, len(raw), nbytes):
            code = int.from_bytes(raw[i : i + nbytes], "big")
            out.append(m.get(code, "�"))
        return "".join(out)

    # ------------------------------------------------------------------ parse
    def _parse(self, ops):
        units = []
        ctm = [1, 0, 0, 1, 0, 0]
        fill = (0.0, 0.0, 0.0)
        stack = []
        i = 0
        n = len(ops)
        while i < n:
            operands, op = ops[i]
            if op == b"q":
                stack.append((list(ctm), fill))
                units.append(Unit("state", [ops[i]]))
                i += 1
            elif op == b"Q":
                ctm, fill = stack.pop()
                units.append(Unit("state", [ops[i]]))
                i += 1
            elif op == b"cm":
                m = [float(v) for v in operands]
                ctm = _mul(m, ctm)
                units.append(Unit("state", [ops[i]]))
                i += 1
            elif op in PATH_BUILD:
                j = i
                pts = []
                clip = False
                while j < n and ops[j][1] not in PATH_PAINT:
                    o, k = ops[j]
                    vals = [float(v) for v in o]
                    if k == b"re":
                        x, y, w, hh = vals
                        pts += [(x, y), (x + w, y + hh)]
                    elif k in (b"m", b"l"):
                        pts.append((vals[0], vals[1]))
                    elif k in (b"c",):
                        pts += [(vals[0], vals[1]), (vals[2], vals[3]), (vals[4], vals[5])]
                    elif k in (b"v", b"y"):
                        pts += [(vals[0], vals[1]), (vals[2], vals[3])]
                    elif k in CLIP:
                        clip = True
                    j += 1
                j += 1  # include paint op
                dev = [self._td(_apply(ctm, x, y)) for x, y in pts]
                xs = [p[0] for p in dev]
                ys = [p[1] for p in dev]
                bbox = (min(xs), min(ys), max(xs), max(ys)) if dev else None
                units.append(Unit("path", ops[i:j], bbox, list(ctm), clip))
                i = j
            elif op == b"BT":
                j = i
                while ops[j][1] != b"ET":
                    j += 1
                block = ops[i : j + 1]
                tu = self._text_unit(block, ctm)
                tu.extra["fill"] = fill
                units.append(tu)
                i = j + 1
            else:
                if op == b"rg":
                    fill = tuple(float(v) for v in operands)
                units.append(Unit("state", [ops[i]]))
                i += 1
        return units

    def _td(self, p):
        return (p[0], self.h - p[1])

    def _text_unit(self, block, ctm):
        """A BT..ET block. Records the origin of every Tj (top-down points)."""
        tm = [1, 0, 0, 1, 0, 0]
        tlm = list(tm)
        size = 0
        fontname = None
        glyphs = []  # (op index in block, (x, y) top-down, size)
        texts = {}  # op index -> decoded text
        state = {}  # op index -> (text line matrix, font name, font size) after the op
        for k, (operands, op) in enumerate(block):
            if op == b"Tm":
                tm = [float(v) for v in operands]
                tlm = list(tm)
            elif op == b"Td":
                tx, ty = float(operands[0]), float(operands[1])
                tlm = _mul([1, 0, 0, 1, tx, ty], tlm)
                tm = list(tlm)
            elif op == b"Tf":
                fontname = operands[0]
                size = float(operands[1])
            elif op in (b"Tj", b"TJ", b"'", b'"'):
                if op != b"Tj":
                    raise NotImplementedError("only Tj is used by these PDFs")
                m = _mul(tm, ctm)
                x, y = self._td(_apply(m, 0, 0))
                # font size in device units (vertical scale of the matrix)
                s = abs(size * (m[3] if abs(m[3]) > 1e-9 else m[1]))
                glyphs.append((k, (x, y), s))
                s0 = operands[0]
                raw = s0.get_original_bytes() if hasattr(s0, "get_original_bytes") else bytes(s0)
                texts[k] = self._decode(fontname, raw)
            state[k] = (list(tlm), fontname, size)
        if glyphs:
            xs = [g[1][0] for g in glyphs]
            ys = [g[1][1] for g in glyphs]
            s = max(g[2] for g in glyphs)
            bbox = (min(xs), min(ys) - s, max(xs) + s, max(ys))
        else:
            bbox = None
        u = Unit("text", list(block), bbox, list(ctm))
        u.extra["glyphs"] = glyphs
        u.extra["texts"] = texts
        u.extra["state"] = state
        u.extra["ins"] = {}
        return u

    # ----------------------------------------------------------------- find
    def lines(self):
        """Visible text grouped into lines: list of (baseline y, text, glyphs)
        where glyphs is a list of (unit, op index, x, y, size, text) in x order.
        Glyphs on one baseline (within 0.6 pt) and close in x form a line."""
        recs = []
        for u in self.units:
            if u.kind != "text":
                continue
            for k, (x, y), s in u.extra["glyphs"]:
                recs.append((u, k, x, y, s, u.extra["texts"][k]))
        recs.sort(key=lambda r: (round(r[3] * 2) / 2, r[2]))
        out = []
        cur = []
        for r in recs:
            if cur and (abs(r[3] - cur[-1][3]) > 0.6 or r[2] - cur[-1][2] > 6 * max(r[4], 1)):
                out.append(cur)
                cur = []
            cur.append(r)
        if cur:
            out.append(cur)
        return [(g[0][3], "".join(r[5] for r in g), g) for g in out]

    def find(self, needle, near_y=None):
        """Find needle in the page text. Returns a list of glyph lists (one
        per hit), each as in lines(). near_y keeps hits within 3 pt of it."""
        hits = []
        for y, text, glyphs in self.lines():
            if near_y is not None and abs(y - near_y) > 3:
                continue
            # map character offsets to glyph indexes
            owners = []
            for gi, r in enumerate(glyphs):
                owners += [gi] * len(r[5])
            start = 0
            while True:
                i = text.find(needle, start)
                if i < 0:
                    break
                gis = sorted(set(owners[i : i + len(needle)]))
                hits.append([glyphs[g] for g in gis])
                start = i + 1
        return hits

    def find_one(self, needle, near_y=None):
        hits = self.find(needle, near_y)
        if len(hits) != 1:
            raise LookupError(f"expected 1 hit for {needle!r}, found {len(hits)}")
        return hits[0]

    def delete_glyphs(self, glyphs):
        """Delete the Tj operators of the given glyph records."""
        by_unit = {}
        for r in glyphs:
            by_unit.setdefault(id(r[0]), (r[0], set()))[1].add(r[1])
        for u, ks in by_unit.values():
            # tombstones keep every stored op index valid; save() drops them
            for k in ks:
                assert u.ops[k] is not None and u.ops[k][1] == b"Tj", "glyph already deleted"
                u.ops[k] = None
            u.extra["glyphs"] = [g for g in u.extra["glyphs"] if g[0] not in ks]
        return len(glyphs)

    def shift_line_after(self, base_y, x_after, dx):
        """Move the glyphs on the line at base_y that start right of x_after
        by dx points (keeps the original glyphs; used when a word in the
        middle of a line gets longer or shorter)."""
        moved = 0
        for u in self.units:
            if u.kind != "text":
                continue
            ks = sorted(k for k, (x, y), s in u.extra["glyphs"] if abs(y - base_y) < 0.6 and x > x_after)
            if not ks:
                continue
            k0 = ks[0]
            glyph_ks = {k for k, p, s in u.extra["glyphs"]}
            # every glyph op after k0 in this block must be on this line
            later = [k for k in glyph_ks if k > k0]
            assert all(k in ks for k in later), "text block spans more than one line"
            j = k0 - 1
            while j >= 0 and (u.ops[j] is None or (u.ops[j][1] not in (b"Td", b"Tm") and j not in glyph_ks)):
                j -= 1
            operands, op = u.ops[j]
            if op == b"Td":
                scale = u.ctm[0]
                v = [float(a) for a in operands]
                u.ops[j] = ([FloatObject(v[0] + dx / scale), FloatObject(v[1])], op)
            elif op == b"Tm":
                v = [float(a) for a in operands]
                assert abs(v[0] - 1) < 1e-6, "unexpected text matrix"
                scale = u.ctm[0]
                u.ops[j] = ([FloatObject(a) for a in v[:4]] + [FloatObject(v[4] + dx / scale), FloatObject(v[5])], op)
            else:
                raise RuntimeError("no Td/Tm before the glyph to move")
            u.extra["glyphs"] = [(k, (p[0] + dx, p[1]) if k in ks else p, s) for k, p, s in u.extra["glyphs"]]
            moved += len(ks)
        return moved

    # ------------------------------------------------------------ selection
    @staticmethod
    def _inside(pt, rect):
        x, y = pt
        return rect[0] <= x <= rect[2] and rect[1] <= y <= rect[3]

    def _unit_in(self, u, rect):
        if u.bbox is None:
            return False
        cx = (u.bbox[0] + u.bbox[2]) / 2
        cy = (u.bbox[1] + u.bbox[3]) / 2
        return self._inside((cx, cy), rect)

    # ------------------------------------------------------------- editing
    def delete_text(self, rect):
        """Delete every shown string (Tj) whose origin lies in rect.
        Returns the number of Tj operators removed."""
        recs = []
        for u in self.units:
            if u.kind != "text":
                continue
            for k, pt, s in u.extra["glyphs"]:
                if self._inside(pt, rect):
                    recs.append((u, k, pt[0], pt[1], s, u.extra["texts"][k]))
        return self.delete_glyphs(recs)

    def delete_paths(self, rect, pred=None):
        """Delete path units (not clips) whose bbox centre lies in rect."""
        removed = 0
        for u in self.units:
            if u.kind == "path" and not u.clip and self._unit_in(u, rect):
                if pred is None or pred(u):
                    u.ops = []
                    u.kind = "deleted"
                    removed += 1
        return removed

    def _shifted_ops(self, u, dx, dy):
        """Ops of unit u moved by (dx, dy) top-down points."""
        # device (bottom-up) vector is (dx, -dy)
        ux, uy = _inv_linear(u.ctm, dx, -dy)
        out = []
        for entry in u.ops:
            if entry is None:
                out.append(None)
                continue
            operands, op = entry
            if u.kind == "path" and op in (b"m", b"l"):
                operands = [FloatObject(float(operands[0]) + ux), FloatObject(float(operands[1]) + uy)]
            elif u.kind == "path" and op == b"c":
                v = [float(a) for a in operands]
                operands = [FloatObject(v[k] + (ux if k % 2 == 0 else uy)) for k in range(6)]
            elif u.kind == "path" and op in (b"v", b"y"):
                v = [float(a) for a in operands]
                operands = [FloatObject(v[k] + (ux if k % 2 == 0 else uy)) for k in range(4)]
            elif u.kind == "path" and op == b"re":
                v = [float(a) for a in operands]
                operands = [FloatObject(v[0] + ux), FloatObject(v[1] + uy), FloatObject(v[2]), FloatObject(v[3])]
            elif u.kind == "text" and op == b"Tm":
                v = [float(a) for a in operands]
                operands = [FloatObject(a) for a in v[:4]] + [FloatObject(v[4] + ux), FloatObject(v[5] + uy)]
            out.append((operands, op))
        return out

    def shift(self, rect, dy, dx=0.0):
        """Move every path/text unit whose centre lies in rect by (dx, dy)."""
        moved = 0
        for u in self.units:
            if u.kind in ("path", "text") and self._unit_in(u, rect):
                u.ops = self._shifted_ops(u, dx, dy)
                b = u.bbox
                u.bbox = (b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy)
                if u.kind == "text":
                    u.extra["glyphs"] = [(k, (p[0] + dx, p[1] + dy), s) for k, p, s in u.extra["glyphs"]]
                moved += 1
        return moved

    def duplicate(self, rect, dy, kinds=("path",), pred=None):
        """Copy units whose centre lies in rect, moved by dy, right after the
        original. Only non-clip paths by default."""
        new_units = []
        count = 0
        for u in self.units:
            new_units.append(u)
            if u.kind in kinds and not u.clip and self._unit_in(u, rect) and (pred is None or pred(u)):
                c = Unit(u.kind, list(u.ops), u.bbox, list(u.ctm), u.clip, dict(u.extra))
                c.ops = self._shifted_ops(c, 0.0, dy)
                b = c.bbox
                c.bbox = (b[0], b[1] + dy, b[2], b[3] + dy)
                new_units.append(c)
                count += 1
        self.units = new_units
        return count

    # --------------------------------------------------- splice new text
    def text_units(self):
        return [u for u in self.units if u.kind == "text"]

    def anchor_td(self, x, y, tol=0.05):
        """(unit, op index) of the Td/Tm that puts the text position at (x, y)
        (top-down points). Used where a glyph was deleted."""
        found = []
        for u in self.text_units():
            if any(abs(p[0] - x) < tol and abs(p[1] - y) < tol for k, p, s in u.extra["glyphs"]):
                continue  # a block that still shows a glyph there (the overlay itself)
            for k, (tlm, f, sz) in u.extra["state"].items():
                op = u.ops[k]
                if op is None or op[1] not in (b"Td", b"Tm"):
                    continue
                px, py = self._td(_apply(_mul(tlm, u.ctm), 0, 0))
                if abs(px - x) < tol and abs(py - y) < tol:
                    found.append((u, k))
        if len(found) != 1:
            raise LookupError(f"anchor at {x:.2f},{y:.2f}: {len(found)} matches")
        return found[0]

    def anchor_glyph(self, x, y, tol=0.05):
        """(unit, op index) of the Tj whose origin is (x, y)."""
        found = [(u, k) for u in self.text_units() for k, p, s in u.extra["glyphs"]
                 if abs(p[0] - x) < tol and abs(p[1] - y) < tol]
        if len(found) != 1:
            raise LookupError(f"glyph at {x:.2f},{y:.2f}: {len(found)} matches")
        return found[0]

    def overlay_unit(self, x, y, text, tol=0.05):
        """The text unit (from a merged overlay) that shows `text` at (x, y)."""
        found = [u for u in self.text_units() if u.extra["glyphs"]
                 and abs(u.extra["glyphs"][0][1][0] - x) < tol and abs(u.extra["glyphs"][0][1][1] - y) < tol
                 and "".join(u.extra["texts"][k] for k, p, s in u.extra["glyphs"]) == text]
        if len(found) != 1:
            raise LookupError(f"overlay text {text!r} at {x:.2f},{y:.2f}: {len(found)} matches")
        return found[0]

    def splice(self, src, target, k):
        """Move the one-line text block `src` (drawn by reportlab, in default
        user space) into text block `target`, right after its op k, so the
        page text reads in order. The position is kept exactly; the text
        state of `target` (line matrix, font, Tc, fill colour) is restored
        afterwards so the following glyphs do not move."""
        (gk, (x, y), _), = src.extra["glyphs"][:1]
        dev = [1, 0, 0, 1, x, self.h - y]
        c = target.ctm
        det = c[0] * c[3] - c[1] * c[2]
        inv = [c[3] / det, -c[1] / det, -c[2] / det, c[0] / det,
               (c[2] * c[5] - c[3] * c[4]) / det, (c[1] * c[4] - c[0] * c[5]) / det]
        tm = _mul(dev, inv)
        ins = [([FloatObject(round(v, 6)) for v in tm], b"Tm"),
               ([FloatObject(v) for v in src.extra["fill"]], b"rg")]
        used_tc = False
        for entry in src.ops:
            if entry is None:
                continue
            operands, op = entry
            if op in (b"Tf", b"Tj"):
                ins.append(entry)
            elif op == b"Tc":
                used_tc = used_tc or float(operands[0]) != 0
                ins.append(entry)
        tlm, fname, fsize = target.extra["state"][k]
        if used_tc:
            ins.append(([FloatObject(0)], b"Tc"))
        ins.append(([FloatObject(round(v, 6)) for v in tlm], b"Tm"))
        if fname is not None:
            ins.append(([fname, FloatObject(fsize)], b"Tf"))
        ins.append(([FloatObject(v) for v in target.extra["fill"]], b"rg"))
        target.extra["ins"].setdefault(k, []).extend(ins)
        src.ops = []
        src.kind = "deleted"

    def text_origins(self, rect=None):
        """List (x, y, size) of Tj origins, optionally inside rect."""
        out = []
        for u in self.units:
            if u.kind == "text":
                for k, pt, s in u.extra["glyphs"]:
                    if rect is None or self._inside(pt, rect):
                        out.append((pt[0], pt[1], s))
        return out

    def save(self, keep_empty=False):
        ops = []
        for u in self.units:
            if u.kind == "text":
                # drop a BT..ET block that has no shown text left
                if not u.extra["glyphs"] and not u.extra["ins"] and not keep_empty:
                    continue
                for k, op in enumerate(u.ops):
                    if op is not None:
                        ops.append(op)
                    ops.extend(u.extra["ins"].get(k, []))
                continue
            ops.extend(op for op in u.ops if op is not None)
        self.cs.operations = ops
        self.page.replace_contents(self.cs)
