"""Visual check of ebook v2 against v1: render both, compare page by page.

    python tools/ebook/visual_diff.py [--dpi 100] [--variant digital|print|plain|all]

LOCAL BUILD/CHECK TOOL ONLY. It uses PyMuPDF (AGPL-3.0) to render pages.
PyMuPDF must never be shipped with the site or imported by site code; it is
not used by build_v2.py either.

Page pairs: v2 pages 1-16 <-> v1 pages 1-16, v2 page 17 is new, v2 pages
18-20 <-> v1 pages 17-19. Pages changed by design: 2, 3, 15, 17 (new) and the
pages whose page-number text changed (6, 7 and the footers of 18-20). Every
other page must render pixel-identical (THRESHOLD below). The script exits
with status 1 if an unchanged page differs.

Writes a markdown table to private-files/v2/visual-diff-<variant>.md and,
for changed pages, side-by-side crops to private-files/v2/diff/.
"""
from __future__ import annotations

import argparse
import difflib
import os
import sys

import numpy as np
import pymupdf  # AGPL: local check tool only, never shipped

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(REPO, "private-files")
OUT = os.path.join(SRC, "v2")
PAIRS = {
    "digital": ("Read-Your-Own-Chart_cosmic_universum_DIGITAL.pdf", "Read-Your-Own-Chart_cosmic_universum_DIGITAL_v2.pdf"),
    "print": ("Read-Your-Own-Chart_cosmic_universum_PRINT.pdf", "Read-Your-Own-Chart_cosmic_universum_PRINT_v2.pdf"),
    "plain": ("Read-Your-Own-Chart-cosmic_universum.pdf", "Read-Your-Own-Chart-cosmic_universum_v2.pdf"),
}
CHANGED_BY_DESIGN = {2, 3, 6, 7, 15, 17, 18, 19, 20}  # v2 page numbers
# A pixel "differs" when any channel differs by more than CHANNEL_TOL (0-255).
# An unchanged page passes when at most THRESHOLD of its pixels differ.
CHANNEL_TOL = 0
THRESHOLD = 0.0  # pixel-identical


def old_page(n_new: int):
    if n_new <= 16:
        return n_new
    if n_new == 17:
        return None
    return n_new - 1


def render(doc, i, dpi):
    pix = doc[i].get_pixmap(dpi=dpi, annots=False, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)


def text_lines(doc, i):
    return [ln.strip() for ln in doc[i].get_text().splitlines() if ln.strip()]


def compare(variant, dpi):
    a_name, b_name = PAIRS[variant]
    A = pymupdf.open(os.path.join(SRC, a_name))
    B = pymupdf.open(os.path.join(OUT, b_name))
    assert len(A) == 19 and len(B) == 20, (len(A), len(B))
    rows = []
    failures = []
    os.makedirs(os.path.join(OUT, "diff"), exist_ok=True)
    for n in range(1, 21):
        o = old_page(n)
        if o is None:
            rows.append((n, "—", "new page", "", "", "; ".join(text_lines(B, n - 1)[:3]) + " …"))
            continue
        ia, ib = render(A, o - 1, dpi), render(B, n - 1, dpi)
        if ia.shape != ib.shape:
            rows.append((n, o, "SIZE DIFFERS", "", "", ""))
            failures.append(n)
            continue
        mask = (np.abs(ia.astype(np.int16) - ib.astype(np.int16)) > CHANNEL_TOL).any(axis=2)
        cnt = int(mask.sum())
        frac = cnt / mask.size
        if cnt:
            ys, xs = np.nonzero(mask)
            k = 72.0 / dpi
            bbox = f"{xs.min() * k:.0f},{ys.min() * k:.0f}–{xs.max() * k:.0f},{ys.max() * k:.0f} pt"
            # side-by-side crop of the changed area (old | new)
            y0, y1 = max(0, ys.min() - 10), min(ia.shape[0], ys.max() + 10)
            x0, x1 = max(0, xs.min() - 10), min(ia.shape[1], xs.max() + 10)
            crop = np.concatenate([ia[y0:y1, x0:x1], np.full((y1 - y0, 6, 3), 255, np.uint8), ib[y0:y1, x0:x1]], axis=1)
            crop = np.ascontiguousarray(crop)
            pm = pymupdf.Pixmap(pymupdf.csRGB, crop.shape[1], crop.shape[0], crop.tobytes(), False)
            pm.save(os.path.join(OUT, "diff", f"{variant}-p{n:02d}.png"))
        else:
            bbox = ""
        ta, tb = text_lines(A, o - 1), text_lines(B, n - 1)
        tdiff = [l for l in difflib.unified_diff(ta, tb, lineterm="", n=0) if l[:1] in "+-" and not l.startswith(("+++", "---"))]
        expected = n in CHANGED_BY_DESIGN
        if not expected and frac > THRESHOLD:
            status = "UNEXPECTED CHANGE"
            failures.append(n)
        elif not expected:
            status = "identical"
        elif cnt == 0:
            status = "identical (expected change missing?)"
            failures.append(n)
        else:
            status = "changed (by design)"
        rows.append((n, o, status, f"{cnt} ({frac * 100:.3f}%)", bbox, " / ".join(tdiff)))
    # the new page 17 must share page 16's background and footer: outside the
    # page number, the footer band (y > 790 pt) must be pixel-identical
    i16, i17 = render(B, 15, dpi), render(B, 16, dpi)
    y0, xnum = int(790 * dpi / 72), int(540 * dpi / 72)
    band = (np.abs(i16[y0:, :xnum].astype(np.int16) - i17[y0:, :xnum].astype(np.int16)) > CHANNEL_TOL).any(axis=2)
    ok = int(band.sum()) == 0
    rows.append(("17 footer", "16 footer", "identical" if ok else "FOOTER DIFFERS", f"{int(band.sum())}", "y > 790 pt, x < 540 pt", "footer of new page 17 vs page 16"))
    if not ok:
        failures.append("17-footer")
    return rows, failures


def table(variant, rows, dpi):
    out = [f"### Visual diff, {variant} edition (v1 vs v2, {dpi} dpi, tolerance {CHANNEL_TOL}, threshold {THRESHOLD})", "",
           "| v2 page | v1 page | result | differing pixels | changed area | text lines changed (- v1, + v2) |",
           "|---|---|---|---|---|---|"]
    for r in rows:
        cells = [str(c).replace("|", "\\|") for c in r]
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dpi", type=int, default=100)
    ap.add_argument("--variant", default="all")
    args = ap.parse_args()
    variants = list(PAIRS) if args.variant == "all" else [args.variant]
    bad = False
    for v in variants:
        rows, failures = compare(v, args.dpi)
        md = table(v, rows, args.dpi)
        with open(os.path.join(OUT, f"visual-diff-{v}.md"), "w", encoding="utf-8") as f:
            f.write(md)
        print(md)
        if failures:
            print(f"FAIL {v}: pages {failures}")
            bad = True
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
