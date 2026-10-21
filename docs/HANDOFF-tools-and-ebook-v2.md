# Handoff: chart tools + ebook v2 (read this first in a new session)

Written 2026-10-21. Feed this file to Claude Code at the start of the next session.

## Paste this as your first message

> Read `C:\Users\micha\Downloads\cosmicuniversum-members\docs\HANDOFF-tools-and-ebook-v2.md`
> and the design it points to. Continue from "Where we stopped".
> Reply in short plain sentences (ASD-STE100 style, I am tired).

## Where we stopped

- The **design document is written, reviewed by a builder check, committed and pushed**:
  `docs/superpowers/specs/2026-10-21-chart-tools-and-ebook-v2-design.md` (commit `58cb69d`).
- **The owner has NOT yet approved it.** Nothing is built. No code, no PDF changes, no deploys for the tools.
- **Next step:** ask the owner to approve the design (or change it). Then use the
  `superpowers:writing-plans` skill to write the build plan. Do not write product code before approval.
- Section 16 of the design lists the writer's calls the owner should check while reading.

## What the project is (one paragraph)

The owner wrote the ebook *Read Your Own Chart* (19 pages, English). Its step 2 sends readers to
"any free birth chart website". We replace that with: (1) a chart worksheet tool at `/tools`
that fills the ebook's own worksheet pages from birth data, in the browser; (2) a 2027 sky calendar
page with times in the reader's time zone; (3) ebook v2 with one new page 17, "My chart, part 2"
(South Node, Black Moon Lilith, Part of Fortune, Vertex), so tool and ebook match 1:1.

## Owner decisions (final)

- Maths runs **in the browser** (no Python server). Python repo is only the **test oracle**.
- **Public** tools at `/tools`. No code gate.
- **Whole Sign houses only.**
- Tool fills **data only**. "My sentence", "Chart story", intentions stay **empty**.
- **New page 17** (layout option C, chosen from mockups). Old 17-19 become 18-20. Fix every page reference and the contents.
- Calendar: 2027, reader's own time zone.
- New PDFs replace the old ones on the Cloudflare site (R2).
- Tools and ebook must match **1:1**. Readability is the main rule.
- **No ebook source exists. Only the PDFs.**

## Where things are

| Thing | Path / place |
|---|---|
| Site repo (Cloudflare Pages) | `C:\Users\micha\Downloads\cosmicuniversum-members` |
| Site GitHub (private) | https://github.com/michaljaszczuk/cosmicuniversum-members (branch `master`) |
| Live site | https://cosmicuniversum.com |
| Ebook PDFs (git-ignored) | `...\cosmicuniversum-members\private-files\` : `..._DIGITAL.pdf` (148 form fields), `..._PRINT.pdf`, `Read-Your-Own-Chart-cosmic_universum.pdf` (plain) |
| Same PDFs also in | `C:\Users\micha\Downloads\` |
| Ebook PDFs on the site | R2 bucket `cosmic-members-files`, keys `read-your-own-chart/Read-Your-Own-Chart_cosmic_universum_DIGITAL.pdf` and `..._PRINT.pdf` |
| Python test oracle | `D:\poligon\daily-oracle-repo` (branch `rediscover-yourself`). Skyfield + `assets/ephemeris/de440s.bsp`, `src/astrology.py`, `src/timezones.py`, `src/geocode.py`, `tests/fixtures/reference_charts.json` |
| Deploy command | `npx wrangler pages deploy public --project-name cosmicuniversum --branch main` (run in the site repo) |

## Facts found about the ebook PDFs

- A4: 595.92 x 842.88 pt. 19 pages. Last written by pypdf (source lost).
- Digital PDF form fields are named like `p16_cell_13`, `p17_box_6`, `p16_line_1`, `p16_multi_10`.
  Page 16 has 77 fields (`line` 9, `multi` 3, `cell` 65). Old page 17 (balance) has 27 fields.
- Embedded fonts: Marcellus, Liberation Sans, DejaVu Sans, Noto Sans Symbols 2.
- Page map: 2 welcome (steps), 3 contents, 4 chart at a glance, 5 formula, 6 reading order,
  7 elements, 8-9 signs, 10 planets, 11 houses, 12 aspects, 13 points and patterns, 14 moon phases
  and retrogrades, 15 how to use worksheets, 16 My chart, 17 My balance and story, 18 2027 calendar, 19 next steps and glossary.
- Page 16 table rows: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto,
  North Node, Chiron, Midheaven (house printed as 10). Page 13 also teaches South Node, Black Moon Lilith,
  Part of Fortune, Vertex, which have no worksheet row. That is why page 17 is new.
- Text to change in v2: page 2 step 2 ("any free birth chart website... Placidus or Whole Sign"),
  page 15 ("a free website (page 2)"), contents, all "page 17/18/19" references.
  Page 18 footer cites Swiss Ephemeris as a source (owner's text; our computation must not use it).

## Hard rules to keep

- **No Swiss Ephemeris** code or data (AGPL). JPL DE440s (public domain) only. Chiron from JPL small-body data (asteroid 2060).
- **Birth data never leaves the browser.** No third-party geocoder. No birth data in URLs, logs, analytics, cookies.
  The site has a consent banner and a Facebook pixel. Only generic events like "tool used".
- Libraries self-hosted, permissive licences. English only.
- Do not touch the live R2 PDFs or the live site for the tools until the owner says so for that step.
  Back up old PDFs in R2 before replacing them. Show new PDFs to the owner first.
- Site repo `.gitignore` excludes `private-files/`, `.dev.vars`, `.wrangler/`. Do not commit PDFs or secrets.

## State of the site (already done today, live)

- `/bonus` page and its unlock/download API removed. Member code and secrets helpers removed.
  Home page links to `/free` with one explaining sentence.
- `/workbook` and `functions/api/workbook/[key].js` kept (email download links).
- Old Cloudflare secrets (`MEMBER_CODE`, `MEMBER_CODE_PREVIOUS`, `TOKEN_SECRET`, `TURNSTILE_SECRET`) still exist and are unused. Owner may delete them in the dashboard.
- Stylesheet moved to `/assets/style.css`.

## Python repo notes (separate project, do not mix up)

- `D:\poligon\daily-oracle-repo` is on branch `rediscover-yourself`. `de440s.bsp` in the repo root is untracked (a copy also lives in `assets/ephemeris/`).
- Memory notes exist for that repo (reel pipeline, Rediscover Yourself PDF pipeline). They are not part of this project.

## Open items for the owner (from the design doc, section 15)

1. Approve the conventions marked with a diamond (element counting, orbs, mean node, mean Lilith, Part of Fortune day/night).
2. Approve wording changes on ebook pages 2 and 15 (placeholder text first, approval before release).
3. Confirm the plain (no-fields) PDF version is still wanted.

## Suggested order after approval

1. Plan (`superpowers:writing-plans`).
2. Python oracle script: expected chart results for many dates/places, plus 2027 calendar dates.
3. Browser maths + data tables, tested against the oracle (accuracy: 0.01 deg planets, 0.02 deg Asc/MC).
4. Calendar page, compared with printed ebook page 18 and NASA eclipse tables. Mismatches go to the owner.
5. Ebook v2: new page 17, renumbering, field mapping, visual diff of unchanged pages.
6. Chart tool + PDF fill, on a Cloudflare **preview** deployment.
7. Owner review, then R2 backup + upload, then deploy `/tools`, home link, privacy paragraph.
