# Handoff: chart tools + ebook v2 (read this first in a new session)

Updated 2026-10-22 (after the build). Feed this file to Claude Code at the start of the next session.

## Paste this as your first message

> Read `C:\Users\micha\Downloads\cosmicuniversum-members\docs\HANDOFF-tools-and-ebook-v2.md`
> and continue from "Where we stopped". Reply in short plain sentences (ASD-STE100 style, I am tired).
> My answers to the owner list: all decided (see the file). I tested as a beginner; my notes are below.

## Where we stopped (updated 2026-10-23, end of day)

- All owner items 1-9 are decided (see "Owner answers" below). Nothing is live. R2 and `main` are untouched.
- Branch `feat/chart-tools`, all work committed locally (last commit `08f0515`). Not pushed since `ac00d01` was made (run `git push` if wanted).
- **Preview is current:** https://preview.cosmicuniversum.pages.dev/tools/ (has the clean template PDFs, new page 17 intro, new city hint).
- Ebook v2 PDFs are rebuilt and current in `private-files/v2/` (DIGITAL + PRINT). Not uploaded to R2.
- **The owner is now testing as a beginner viewer** (making a chart, using the worksheet PDF, reading the ebook). They will bring notes in a fresh session. Expect wording/UX fixes: ebook text via `tools/ebook/build_v2.py` and `page17.py`, tool text via `public/tools/`.
- After fixes: rebuild (`PYTHONIOENCODING=utf-8 py tools/ebook/build_v2.py`), `node tools/build/copy-assets.mjs`, `node --test tools/tests/*.test.mjs`, `py tools/ebook/test_field_map.py`, commit, deploy preview.
- **Task 9 starts only when the owner says "go Task 9".** The owner must also confirm they tested the preview.
- Deploy commands are blocked for Claude by the permission classifier. The owner runs them with the `!` prefix, e.g. `! npx wrangler pages deploy public --project-name cosmicuniversum --branch preview`.

## Session 2026-10-23 changes (all committed)

- Page 18 sources line: "Swiss Ephemeris" -> "JPL DE440s" (`edit_sources`).
- Page 17 intro: ebook keeps "Copy the sign, degree and house…". The tool download (`pages-16-18-*.pdf`, built with `TOOL_BUILD`) says "We filled in the sign, degree and house for you. Read what each point means, then write one sentence about it with the formula on page 5 of your ebook."
- Ebook page 2 step 3 and page 15 "Before you start" now say the tool fills the facts and the reader writes sentences (`rewrite_step`, `P2_STEP3`, `P15_BEFORE`).
- Tool chart page city hint: nearest larger city, same time zone, about 1 degree Ascendant shift per 70 km. Planet signs do not change.
- Stale template PDFs (red PLACEHOLDER tag on page 2) fixed by re-running copy-assets; preview redeployed.
- Meta automatic advanced matching and automatic events checked in Events Manager: both OFF (dataset 1082304004580005).
- Editable PDF tested by the owner on mobile and desktop: letters, numbers, emoji, special characters all work.

## Known gaps to consider (not decided)

- No way to type own latitude/longitude (cities list = GeoNames cities15000, population 15000+).
- Owner said the PDF and tool feel too complicated for a beginner. A short "Step 1, 2, 3" guide at the top of the tool page was offered; owner first wants to test and take notes.
- The download holds only ebook pages 16-18; it points to ebook pages 5 and 13.

## Approved privacy wording (ALREADY ADDED to `public/privacy/index.html` on the branch, commit after `e34f652`; goes live only in Task 9)

New section after "Cookies and the Meta Pixel":

> **Our chart tools**
>
> Our chart tool and sky calendar at cosmicuniversum.com/tools work on your own device. When you type your birth date, time and place, your device does the maths. We do not receive, store or see what you type. It is not sent to our server or to any other company, and it is not in the page address.
>
> The calendar saves your chosen time zone and your notes in your own browser only. We cannot read them. You can delete them by clearing your browser data.
>
> If you accept cookies, the Meta Pixel may record that you visited a tool page and that you used a tool. It never records what you typed.
>
> The tool pages load fonts from Google Fonts. Google receives your IP address when the fonts load. No birth data is sent in that request. Google's privacy policy applies.

Plus one list item under "Who processes your data for us": "**Google** (Fonts) receives your IP address when the tool pages load fonts."

## Task 9 (do only after the owner says go)

1. Back up the current PDFs in R2 (bucket `cosmic-members-files`, keys `read-your-own-chart/Read-Your-Own-Chart_cosmic_universum_DIGITAL.pdf` and `..._PRINT.pdf`) under the same names plus a version suffix (e.g. `_v1`). Then upload the v2 DIGITAL and PRINT PDFs from `private-files/v2/` under the old keys. The email download link changes for everyone at that moment.
2. Run `node tools/build/copy-assets.mjs` (strict; it copies the template PDFs, `conventions.json`, `field-map.json` into `public/tools/data/`). The template PDFs are git-ignored and exist only on this PC, so deploy only from this PC.
3. Privacy paragraph: already added on the branch (owner approved the wording). Just confirm it deploys. Content: the chart is computed on the device and nothing typed is sent; the calendar saves the chosen zone and notes in this browser only; with consent the Meta Pixel may record that a tool was used ("tool_used"), never what was typed; optionally mention Google Fonts.
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

- **Ebook change list:** `docs/EBOOK-CHANGES-TODO.md`. Read it. Add every new ebook fix there.
- **Paid chart report (new):** `docs/HANDOFF-chart-report.md`.
