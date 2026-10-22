# Chart Tools and Ebook v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a browser chart worksheet tool, a 2027 sky calendar, and ebook v2 (new page 17) on cosmicuniversum.com, with tool and ebook matching 1:1.

**Architecture:** All maths runs in the browser from precomputed JPL DE440s tables (Chebyshev coefficients, lazy-loaded). A Python oracle in `D:\poligon\daily-oracle-repo` writes expected results; the JS is tested against them. Ebook v2 is built from the current PDFs (no source exists) and filled via form-field mapping.

**Tech Stack:** Static JS (ES modules, no CDN), Node test runner, Python 3 + Skyfield (oracle only), pdf-lib (MIT) for PDFs, Cloudflare Pages + R2, wrangler.

**Spec:** `docs/superpowers/specs/2026-10-21-chart-tools-and-ebook-v2-design.md` (approved by the owner 2026-10-22). Handoff: `docs/HANDOFF-tools-and-ebook-v2.md`.

## Global Constraints

- No Swiss Ephemeris code or data. JPL DE440s only; Chiron from JPL small-body data (asteroid 2060).
- Birth data never leaves the browser: no third-party geocoder, no birth data in URLs, logs, analytics, cookies. Only generic events like "tool used".
- Libraries self-hosted, permissive licences. English only.
- Whole Sign houses only. Tool fills data only; "My sentence", "Chart story", intentions stay empty.
- Accuracy: planets within 0.01 deg of oracle; Ascendant and Midheaven within 0.02 deg; sign and house identical.
- Date range at least 1900-2100. First-use download at most about 5 MB (gzip).
- Conventions (config file `tools/config/conventions.json`, shared by JS and oracle): elements count Sun-Saturn plus Ascendant (total 8); orbs from page 12, larger value when Sun/Moon involved; mean node; South Node opposite; mean Lilith; Part of Fortune day/night (day = Sun in houses 7-12); Vertex via colatitude with RAMC + 180.
- Retrograde by real motion; Sun, Moon, nodes get no mark. Midheaven house printed as 10.
- Do not touch live R2 PDFs or the live site until the owner says so for that step. Back up old PDFs in R2 first. Do not commit PDFs, `.dev.vars`, `.wrangler/`, `private-files/`.
- Deploy tools only to a Cloudflare preview first: `npx wrangler pages deploy public --project-name cosmicuniversum --branch preview`.

## Review Focus

- No birth time: houses, Rising, chart ruler, MC, Vertex, Part of Fortune blank; page says so.
- Ambiguous or non-existent local time at a clock change: reader sees a choice, never a silent guess.
- Polar latitude (above 66 deg): clear message, no NaN in the PDF.
- Dates at range edges (1900-01-01, 2100-12-31) and BCE-style bad input: clear error.
- Stationary planet near retrograde switch, and a planet at exactly 0 deg / 29.99 deg of a sign: correct sign and mark.

## File Structure

- `tools/config/conventions.json` - shared conventions.
- `tools/ephem/build_tables.py` (in oracle repo, mirrored copy of output in `public/tools/data/`) - makes coefficient tables.
- `public/tools/js/{time,ephemeris,houses,points,balance,aspects,patterns,chart}.js` - one maths module each.
- `public/tools/js/{places,pdf,ui}.js` - city search, PDF fill, page UI.
- `public/tools/data/` - tables, cities, field map.
- `public/tools/index.html`, `chart/index.html`, `calendar/index.html`.
- `tools/tests/*.test.mjs` - Node tests against oracle JSON in `tools/tests/oracle/`.
- `tools/ebook/` - v2 build scripts, `field-map.json`, visual diff script.
- Oracle repo: `scripts/make_oracle.py`, `scripts/make_calendar_2027.py`.

---

### Task 1: Oracle script (charts)

**Files:**
- Create: `D:\poligon\daily-oracle-repo\scripts\make_oracle.py`, `tools/config/conventions.json`, `tools/tests/oracle/charts.json`
- Test: `D:\poligon\daily-oracle-repo\tests\test_make_oracle.py`

**Interfaces:**
- Produces: `charts.json` = list of `{input:{utc, lat, lon, tz, hasTime}, expected:{planets:{name:{lon, retro}}, asc, mc, vertex, node, lilith, fortune, houses, elements, modes, aspects, patterns, moonPhase}}`. Used by Tasks 3-8.

- [ ] **Step 1: Write failing test `test_oracle_includes_reference_charts`** asserting every chart in `tests/fixtures/reference_charts.json` appears in output with Sun longitude within 0.001 deg of Skyfield.
- [ ] **Step 2: Run** `pytest tests/test_make_oracle.py -v` in the oracle repo. Expect FAIL (module missing).
- [ ] **Step 3: Implement** `make_oracle(cases) -> list[dict]` using `src/astrology.py` and Skyfield with `assets/ephemeris/de440s.bsp`. Add generated cases: 200 dates 1900-2100, both hemispheres, latitudes up to 66, DST edges, no-time cases. Chiron from JPL small-body SPK (asteroid 2060). Apply `conventions.json`.
- [ ] **Step 4: Run test.** Expect PASS. Run script; write `charts.json`.
- [ ] **Step 5: Commit** in both repos.

### Task 2: Ephemeris tables builder

**Files:**
- Create: `D:\poligon\daily-oracle-repo\scripts\build_tables.py`, `public/tools/data/ephem-*.bin` (+ `manifest.json`)
- Test: `tools/tests/ephemeris.test.mjs`

**Interfaces:**
- Produces: JS `loadEphemeris(): Promise<Eph>`, `Eph.longitude(body: string, jdTT: number): {lon:number, speed:number}` for Sun, Moon, Mercury-Pluto, Chiron; `Eph.meanNode(jd)`, `Eph.meanLilith(jd)`.

- [ ] **Step 1: Write failing test `ephemeris matches oracle within 0.01 deg`** looping all `charts.json` planets (uses nutation, aberration as oracle does).
- [ ] **Step 2: Run** `node --test tools/tests/ephemeris.test.mjs`. Expect FAIL.
- [ ] **Step 3: Implement** the table builder (Chebyshev fit, per-body interval chosen so error < 0.001 deg, geocentric apparent ecliptic-of-date longitude) and `public/tools/js/ephemeris.js`. Check gzip total under 5 MB; if over, widen intervals for slow bodies.
- [ ] **Step 4: Run test.** Expect PASS. Print size.
- [ ] **Step 5: Commit.**

### Task 3: Time and place

**Files:**
- Create: `public/tools/js/time.js`, `public/tools/js/places.js`, `public/tools/data/cities.json` (GeoNames cities15000, CC-BY, attribution on page)
- Test: `tools/tests/time.test.mjs`

**Interfaces:**
- Produces: `localToUtc(local:{y,m,d,h,mi}, tz:string): {status:'ok'|'ambiguous'|'missing', utc?:Date, options?:Date[]}`; `searchCities(q:string): City[]` where `City={name,country,lat,lon,tz}`; `jdFromDate(d:Date): number`.

- [ ] **Step 1: Write failing tests:** `Europe/Warsaw 2027-03-28 02:30 is missing`; `2027-10-31 02:30 is ambiguous with two options`; `1985-07-01 12:00 Warsaw -> 10:00 UTC`; `searchCities('Warszawa')` returns lat within 0.1 of 52.23.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** with `Intl.DateTimeFormat` zone offsets (browser has historical tz). City file loaded lazily, searched with prefix match, diacritics folded.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit.**

### Task 4: Angles, houses, points

**Files:**
- Create: `public/tools/js/houses.js`, `public/tools/js/points.js`
- Test: `tools/tests/houses.test.mjs`

**Interfaces:**
- Consumes: `Eph`, `jdFromDate`.
- Produces: `angles(jdUT, lat, lon): {asc:number|null, mc:number, vertex:number|null}` (null at polar failure); `wholeSignHouse(lon:number, asc:number): number`; `fortune(asc, sun, moon, isDay): number`; `southNode(n)`.

- [ ] **Step 1: Write failing tests** over all oracle charts: asc/mc within 0.02 deg, vertex within 0.02, houses equal, Part of Fortune within 0.02. Add polar case lat 80 returns `asc === null`.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** Reuse the formulas in `src/astrology.py` (port exactly).
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit.**

### Task 5: Chart assembly, balance, aspects, patterns

**Files:**
- Create: `public/tools/js/{chart,balance,aspects,patterns}.js`
- Test: `tools/tests/chart.test.mjs`

**Interfaces:**
- Produces: `buildChart(input:{utc:Date, lat, lon, hasTime:boolean}, eph:Eph, conv:object): Chart` with fields matching `expected` in `charts.json`; also `chartRuler`, `strongestElement`, `weakestElement`, `moonPhase` (8 phases, page 14), `tightestAspects(3)`.

- [ ] **Step 1: Write failing tests:** all oracle charts match (signs, houses, elements, modes, aspects, patterns, moon phase); no-time case blanks houses/Rising/ruler/MC/Vertex/Fortune and element total is 7; Scorpio rising gives traditional ruler Mars with `modernRuler: 'Pluto'`.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** to `conventions.json`.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit.**

### Task 6: 2027 calendar data and page

**Files:**
- Create: `D:\poligon\daily-oracle-repo\scripts\make_calendar_2027.py`, `public/tools/data/calendar-2027.json`, `public/tools/calendar/index.html`, `public/tools/js/calendar.js`, `docs/calendar-check-2027.md`
- Test: `tools/tests/calendar.test.mjs`

**Interfaces:**
- Produces: `calendar-2027.json` = `{events:[{type:'new'|'full'|'eclipse'|'station', utc, sign, deg, detail}]}`; `toLocal(utc, tz)`; `makeIcs(events, tz): string`.

- [ ] **Step 1: Write failing tests:** event count per month matches JSON; `toLocal` of a known event in `Pacific/Auckland` crosses a date line correctly; `.ics` parses and has one VEVENT per event.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** the script (Skyfield lunar phases, stations, eclipse geometry) and page: detected zone, city picker, this-month view, 12-month view, `.ics` button, per-month note saved in `localStorage` only.
- [ ] **Step 4: Compare** to printed ebook page 18 and NASA tables; write mismatches to `docs/calendar-check-2027.md`. **Stop and send mismatches to the owner.** Run tests. Expect PASS.
- [ ] **Step 5: Commit.**

### Task 7: Ebook v2 build

**Files:**
- Create: `tools/ebook/build_v2.py`, `tools/ebook/field-map.json`, `tools/ebook/visual_diff.py`
- Test: `tools/ebook/test_field_map.py`

**Interfaces:**
- Produces: `field-map.json` = `{page:{item:fieldName}}` for pages 16, 17, 18; v2 digital, print, plain PDFs in `private-files/v2/` (git-ignored).

- [ ] **Step 1: Write failing test `every field in map exists in v2 digital PDF and every page-16/17/18 field is mapped or marked writing-only`.**
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** with pypdf + reportlab: insert redrawn page 17 (Marcellus, same badge/table/footer as page 16, four points with sign/degree/house fields, large sentence line, "how to find it" lines from page 13), renumber old 17-19 to 18-20, update footers, contents (page 3), every "page N" reference (scan all text), page 2 step 2 and page 15 placeholder wording pointing to `cosmicuniversum.com/tools` and Whole Sign. Reverse-engineer old field names from the PDF.
- [ ] **Step 4: Visual diff:** render old and new, unchanged pages must be identical (pixel diff under threshold); list changed pages. Run test. Expect PASS.
- [ ] **Step 5: Commit scripts and field map only.** **Send PDFs and placeholder wording to the owner for approval.**

### Task 8: Chart tool page and PDF fill

**Files:**
- Create: `public/tools/index.html`, `public/tools/chart/index.html`, `public/tools/js/{pdf,ui}.js`, `public/tools/data/ebook-pages-16-18-{edit,print}.pdf`
- Test: `tools/tests/pdf.test.mjs`

**Interfaces:**
- Consumes: `buildChart`, `field-map.json`.
- Produces: `fillEditable(chart, name): Promise<Uint8Array>` (fields kept editable), `renderPrint(chart, name): Promise<Uint8Array>` (values drawn, writing lines blank).

- [ ] **Step 1: Write failing tests:** fill a known chart, read fields back, values equal expected; writing fields ("My sentence", chart story) are empty; print version has no form fields.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** with self-hosted pdf-lib. Page: name, date, time or "I don't know", city search, ambiguity choice, polar message, on-screen facts in ebook words (Big Three first, 7-step checklist, "how this chart was made"), note "Your birth details never leave this device." No network calls with birth data; consent-aware generic "tool used" event only.
- [ ] **Step 4: Run tests.** Expect PASS. Check in browser (mobile width) with network panel: no request carries birth data.
- [ ] **Step 5: Commit.**

### Task 9: Preview, owner review, release

**Files:**
- Modify: `public/index.html` (link to tools), `public/privacy/index.html` (new paragraph, wording from owner)

- [ ] **Step 1:** Deploy to preview branch. Send link to the owner.
- [ ] **Step 2:** Owner approves tools, PDFs, wording. **Wait.**
- [ ] **Step 3:** On owner's go: back up current R2 keys with version suffix, upload new PDFs, then `npx wrangler pages deploy public --project-name cosmicuniversum --branch main`.
- [ ] **Step 4:** Check live `/tools`, download links, privacy page.
- [ ] **Step 5: Commit and push.**
