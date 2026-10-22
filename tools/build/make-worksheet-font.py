"""Make public/tools/vendor/fonts/DejaVuSans-worksheet.ttf: a subset of DejaVu Sans
(one of the fonts embedded in the ebook PDFs) with Latin, Greek and Cyrillic letters,
the degree sign and the retrograde mark (U+211E). pdf.js uses it for the retrograde
column of the worksheet and for a name or place with letters that the form font
(Helvetica, WinAnsi) cannot show.

Source: DejaVuSans.ttf as shipped with matplotlib (Bitstream Vera / DejaVu licence,
copied next to the output as LICENSE-DejaVu.txt). Needs fontTools (MIT).
Run: python tools/build/make-mark-font.py [path/to/DejaVuSans.ttf]
"""
import os
import shutil
import sys

from fontTools import subset

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "tools", "vendor", "fonts")


def find_source():
    if len(sys.argv) > 1:
        return sys.argv[1]
    import matplotlib  # only used to locate its bundled copy of DejaVu Sans

    return os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSans.ttf")


def main():
    src = find_source()
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "DejaVuSans-worksheet.ttf")
    opts = subset.Options()
    opts.layout_features = []
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts)
    ranges = [(0x20, 0x7E), (0xA0, 0x24F), (0x370, 0x3FF), (0x400, 0x4FF), (0x1E00, 0x1EFF), (0x2010, 0x2027)]
    codes = [c for a, b in ranges for c in range(a, b + 1)] + [0x211E]
    sub.populate(unicodes=codes)
    sub.subset(font)
    subset.save_font(font, out, opts)
    lic = os.path.join(os.path.dirname(src), "LICENSE_DEJAVU")
    if os.path.exists(lic):
        shutil.copyfile(lic, os.path.join(OUT_DIR, "LICENSE-DejaVu.txt"))
    print(out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
