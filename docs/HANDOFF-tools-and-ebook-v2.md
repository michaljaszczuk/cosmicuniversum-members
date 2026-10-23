# Handoff: chart tools + ebook v2 (read this first in a new session)

Updated 2026-10-22 (after the build). Feed this file to Claude Code at the start of the next session.

## Paste this as your first message

> Read `C:\Users\micha\Downloads\cosmicuniversum-members\docs\HANDOFF-tools-and-ebook-v2.md`
> and continue from "Where we stopped". Reply in short plain sentences (ASD-STE100 style, I am tired).
> My answers to the owner list: (write them here, or say "ask me").

## Where we stopped

- Design approved by the owner. Plan written: `docs/superpowers/plans/2026-10-22-chart-tools-and-ebook-v2.md`.
- **Tasks 1-8 are built, reviewed and fixed.** Final whole-branch review done, fix wave reviewed. 71 tests pass (`node --test tools/tests/*.test.mjs`).
- Site work is on branch **`feat/chart-tools`** (pushed to GitHub). `master` is untouched.
  Oracle work is on branch `feat/chart-oracle` in `D:\poligon\daily-oracle-repo` (not pushed).
- **Preview is deployed:** https://preview.cosmicuniversum.pages.dev/tools/ (branch `preview`, noindex). Nothing is live. R2 and `main` are untouched.
- **Next step: the owner tests the preview and answers the owner list below. Then do Task 9** (see below).

## Task 9 (do only after the owner says go)

1. Back up the current PDFs in R2 (bucket `cosmic-members-files`, keys `read-your-own-chart/Read-Your-Own-Chart_cosmic_universum_DIGITAL.pdf` and `..._PRINT.pdf`) under the same names plus a version suffix (e.g. `_v1`). Then upload the v2 DIGITAL and PRINT PDFs from `private-files/v2/` under the old keys. The email download link changes for everyone at that moment.
2. Run `node tools/build/copy-assets.mjs` (strict; it copies the template PDFs, `conventions.json`, `field-map.json` into `public/tools/data/`). The template PDFs are git-ignored and exist only on this PC, so deploy only from this PC.
3. Add the privacy paragraph to `public/privacy/index.html` (owner approves wording). Content: the chart is computed on the device and nothing typed is sent; the calendar saves the chosen zone and notes in this browser only; with consent the Meta Pixel may record that a tool was used ("tool_used"), never what was typed; optionally mention Google Fonts.
4. Link `/tools` from `public/index.html` with one explaining sentence. Remove `noindex` on `/tools`, `/tools/chart`, `/tools/calendar` (meta tags in the three HTML files, and the `/tools` rules in `public/_headers`) when the owner says so.
5. Merge `feat/chart-tools` to `master` (owner decides; use `superpowers:finishing-a-development-branch`), then `npx wrangler pages deploy public --project-name cosmicuniversum --branch main`.
6. Check live: `/tools`, `/tools/chart`, `/tools/calendar`, download links, privacy page.

## Owner answers so far (session of 2026-10-23)

Asked one by one. Decided:
- **1 Calendar gaps: ACCEPT.** No ebook fix.
- **2 Placeholder wording: APPROVED as drafted.** `MARK_PLACEHOLDERS = False` is set in `tools/ebook/build_v2.py`.
- **3 Plain PDF: DROPPED.** Build is now `("digital", "print")` only.
- **4 Placidus: REWORDED.** New `edit_page4` and `edit_glossary` in `build_v2.py`. Page 4 now reads "In Whole Sign, house 1 is this whole sign." (shorter than first proposed, to fit the column). Glossary reads "for example Whole Sign." Placidus no longer appears in the book.
- DIGITAL and PRINT v2 PDFs were rebuilt in `private-files/v2/` and checked (text and page images). Changes in `build_v2.py` are NOT committed yet.
- **Still open: items 5-9** below. Item 5 (Swiss Ephemeris footer on page 18): I recommend rewording it to name NASA JPL. Owner asked whether Swiss Ephemeris differs from NASA data (tiny gap, below 0.001 arcsec for planets; Swiss is built on older JPL DE431) and what professionals use (Swiss Ephemeris via Solar Fire, Astro.com). Owner may compare a few known charts to Astro.com before deciding.
- Note: running `py tools/ebook/build_v2.py` prints a cp1252 error at the end (the arrow in the change log). The PDFs are already written. Use `PYTHONIOENCODING=utf-8` to avoid it. Do not use `py -I` (it hides the user-site `pypdf`).
- **Items 5-9 decided (2026-10-23):**
  - 5: footer reworded to "NASA moon phase and eclipse tables, JPL DE440s." (`edit_sources` in `build_v2.py`). DIGITAL and PRINT v2 rebuilt and checked. Not committed yet.
  - 6: Meta automatic advanced matching stays OFF. Owner checks Events Manager -> Pixel -> Settings.
  - 7: date range stays 1900-2100.
  - 8: owner tests the editable PDF (Acrobat, phone viewer) before Task 9.
  - 9: Google Fonts stay. Privacy page names them.
- Next: commit `build_v2.py` change, owner tests PDF, owner says go for Task 9.

## Owner list (open decisions)

1. **Calendar gaps:** 5 of 42 printed rows on ebook page 18 differ from the computed values (`docs/calendar-check-2027.md`). Four are 1-5 s past a minute boundary (20 May, 4 Jul, 30 Sep, 15 Oct). Jupiter turns direct 13 Apr: printed Leo 17 deg, exact 16.9955 deg. The tool drops seconds like the ebook. Owner rules: fix the ebook or accept.
2. **Placeholder wording** on ebook pages 2, 15, 17 (red PLACEHOLDER tags; one constant `MARK_PLACEHOLDERS` in `tools/ebook/build_v2.py` turns them off; wording constants at about lines 69-81). The page 17 "how to find it" lines are copied from page 13 meaning text (page 13 has no how-to-find text).
3. **Plain (no-fields) PDF** is an older edition of the book (text differs on pages 4, 7, 10, 13, 15, 16, 18, 19). Do not ship plain v2. Recommend: drop it, or rebuild from the PRINT v1.
4. Ebook page 4 ("In most house systems...") and the glossary still mention **Placidus**. The tool uses Whole Sign only.
5. The page 18 footer cites **Swiss Ephemeris**. The tool does not use it. Keep or reword?
6. Keep **Meta automatic advanced matching off** in Events Manager.
7. Date range is 1900-2100 (spec minimum). Data covers 1850-2150. Widen `dateRange` in `tools/config/conventions.json` and the constants in `public/tools/js/input.js` if wanted.
8. Test the editable PDF in Acrobat and Preview (not tested; fields have no appearance streams, `NeedAppearances` false).
9. Google Fonts load from Google on the tool pages (like the rest of the site). The spec says "no CDN". No birth data goes in those requests.

## Rulings made during the build (for the record)

- Oracle scripts take an output path and write into the site repo; each repo has its own commits.
- `spiceypy` is used in the oracle repo only (reads the Chiron SPK type 21). Not shipped.
- Yod = standard (sextile base, two quincunxes to the apex). Spec line 141 wording is ambiguous; consider amending it.
- "Three tightest aspects" and patterns skip any aspect with the Ascendant or MC.
- Times shown with seconds dropped (floor), same as the ebook.
- Pre-1972 civil time is treated as UT1 (GMT). Fixed in `public/tools/js/ephemeris.js` and the oracle. Einstein 1879 Ascendant moved by -0.159 deg.
- Vertex is blank when unreliable (|lat| < 1 or > 66). Polar Ascendant cutoff is |lat| >= 90 - obliquity (about 66.56 deg).
- Meta Pixel automatic events are disabled on `/tools` pages (`cuPixelNoAutoConfig` flag in `public/assets/consent.js`) because they sent page text to Meta after consent.
- Page 15 edits kept: website to tool, "two" to "three" worksheet pages, a new Worksheet 2 block.
- Tool UI: Moon-sign warning needs `tz` when there is no birth time; `tightestAspects` can return 0-2 items.

## Where things are

| Thing | Path / place |
|---|---|
| Site repo (Cloudflare Pages) | `C:\Users\micha\Downloads\cosmicuniversum-members` (branch `feat/chart-tools`) |
| Site GitHub (private) | https://github.com/michaljaszczuk/cosmicuniversum-members |
| Live site | https://cosmicuniversum.com |
| Preview | https://preview.cosmicuniversum.pages.dev/tools/ |
| Design | `docs/superpowers/specs/2026-10-21-chart-tools-and-ebook-v2-design.md` |
| Plan | `docs/superpowers/plans/2026-10-22-chart-tools-and-ebook-v2.md` |
| Calendar check | `docs/calendar-check-2027.md` |
| Tool code | `public/tools/` (js, data, vendor, chart/, calendar/) |
| Tests | `tools/tests/*.test.mjs`, `tools/ebook/test_field_map.py`, oracle data `tools/tests/oracle/charts.json` |
| Ebook v2 build | `python tools/ebook/build_v2.py` (reads `private-files/*.pdf`, writes `private-files/v2/`) |
| Ebook PDFs (git-ignored) | `private-files/` (v1) and `private-files/v2/` (v2 + `pages-16-18-edit.pdf`, `pages-16-18-print.pdf`) |
| Python oracle | `D:\poligon\daily-oracle-repo` (branch `feat/chart-oracle`; needs env `CHART_SITE_REPO` = site repo path) |
| Build ledger (git-ignored, optional) | `.superpowers/sdd/2026-10-22-chart-tools-and-ebook-v2/progress.md` |
| Deploy preview | `node tools/build/copy-assets.mjs` then `npx wrangler pages deploy public --project-name cosmicuniversum --branch preview` |
| Deploy live | same, with `--branch main` (only on owner's go) |

## Hard rules to keep

- **No Swiss Ephemeris** code or data. JPL DE440s and JPL small-body data only. PyMuPDF (AGPL) only in `tools/ebook/visual_diff.py`, never shipped.
- **Birth data never leaves the browser.** No third-party geocoder. No birth data in URLs, logs, analytics, cookies, storage.
- Do not touch live R2 PDFs or the live site until the owner says so for that step. Back up old PDFs in R2 first.
- Do not commit PDFs, `.dev.vars`, secrets, `private-files/`.
- Whole Sign houses only. The tool fills data only; writing fields stay empty.

## State of the site before this work (already live)

- `/bonus` removed. Home links to `/free`. `/workbook` and `functions/api/workbook/[key].js` kept (email download links).
- Old Cloudflare secrets (`MEMBER_CODE`, `MEMBER_CODE_PREVIOUS`, `TOKEN_SECRET`, `TURNSTILE_SECRET`) still exist, unused. Owner may delete them.
