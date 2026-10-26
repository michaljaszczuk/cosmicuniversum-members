# Chart Report V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the V1 birth chart report into V2: a "Why you are like this" chapter, clearer chart ruler, clashes, aspects and Saturn return, bigger font, no transits/synastry/progressions.

**Architecture:** Same pipeline as V1 (`facts.mjs` → WRITER → `validate.py` → CHECKER → HUMANIZER → `validate.py` → `build_report.py`). New meanings go into `library.json`. Saturn return dates are computed in a new pure JS module. New text helpers in `build_report.py` are pure functions with tests.

**Tech Stack:** Node (ES modules, `node:test`), Python 3.14 (reportlab, pytest 8.3.4).

**Spec:** `docs/superpowers/specs/2026-10-26-chart-report-v2-design.md`

## Global Constraints
- The GitHub repo is PUBLIC. Never commit real birth data. Tests use only `tools/report/samples/demo-*.json` or made-up values. The owner's files stay in `private-files/report-samples/` (git-ignored).
- Every new library sentence: max 22 words, no em or en dashes, straight quotes, none of the `BANNED` words in `validate.py`, no "will", reflection only (no predictions, no health, money or legal advice).
- New library entries carry `"p": "report"` instead of an ebook page number.
- The report text never says "ebook", "workbook" or "Read Your Own Chart".
- Python runs as `PYTHONIOENCODING=utf-8 py ...`. JS tests run as `node --test tools/tests/<file>`.
- Each sign's existing `keywords`, `gift`, `shadow`, `ask` stay unchanged (they match the free ebook).

## Review Focus
1. A chart with no red (tense major) aspect between planets: the "Where you pull two ways" box is left out, no crash. Test in Task 5.
2. A Saturn return window past the ephemeris end (JD 2506072.5, year 2149) or before birth: it is cut off, never an error. Test in Task 3.
3. A customer whose first Saturn return is still in the future (born after about 1997): the label says "coming", not "past". Test in Task 3 (`status` field).
4. An aspect body with no `short` word (for example a future point): `fill_aspect` falls back to the plain name. Test in Task 4.
5. A `src` list with unknown or non-chart refs (`lib:`, `meta:`, a typo): `reason_line` skips them; an empty result prints no line. Test in Task 4.

---

### Task 1: Library V2 meanings (owner approval gate)

**Files:**
- Modify: `tools/report/library.json`
- Test: `tools/report/test_library.py` (create)

**Interfaces:**
- Produces: `LIB["sign"][S]["drives"|"likes"|"dislikes"|"drains"|"needs"]` (str, all 12 signs); `LIB["house"][n]["pulls"]` (str, "1".."12"); `LIB["planet"][P]["short"]` (10 planets) and `LIB["point"][X]["short"]` for `Ascendant`, `Midheaven`, `Chiron`, `NorthNode`, `SouthNode`; `LIB["aspect"][t]["readAsYou"]` for every aspect type that has `readAs` (uses "A" and "B" and "you", for example "A helps B when you make the effort."); `LIB["nextSteps"]["saturnReturn"]["practical"]` (str). `_about` no longer mentions the ebook as a rule for the reader; it says core entries match the free ebook and `"p": "report"` entries are report-only.

- [ ] **Step 1: Write the failing tests** in `tools/report/test_library.py` (unittest style, like `tools/ebook/test_field_map.py`):
  - `test_signs_have_life_fields`: every sign has the 5 new fields, each a non-empty str.
  - `test_houses_have_pulls`, `test_bodies_have_short` (planets + the 5 points above; `short` is 1 to 4 words, lower case first letter), `test_aspects_have_read_as_you` (contains "A", "B" and " you").
  - `test_new_text_rules`: for every new field: `len(text.split()) <= 22`, no `—`/`–`, no curly quotes, no word from `validate.BANNED`, no `\bwill\b`.
  - `test_core_fields_unchanged`: `LIB["sign"]["Libra"]["keywords"] == "Fair · friendly · loves balance"` and `LIB["house"]["9"]["detail"] == "travel, study, big questions"`.
- [ ] **Step 2: Run** `PYTHONIOENCODING=utf-8 py -m pytest tools/report/test_library.py -q`. Expected: FAIL (missing fields).
- [ ] **Step 3: Write the entries.** Each new meaning extends the sign's existing keywords, gift and shadow (no new astrology ideas). Add `"p": "report"` next to each new block. Short words to use: Sun "who you are", Moon "your feelings", Mercury "how you think", Venus "what you love", Mars "your energy", Jupiter "your growth", Saturn "your hard work", Uranus "your need for freedom", Neptune "your dreams", Pluto "your deep changes", Chiron "your sore spot", Ascendant "how others see you", Midheaven "your path in life", NorthNode "where you grow", SouthNode "your old habits".
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: OWNER GATE.** Print all new texts for the owner as one readable list (sign by sign). Stop. Change what the owner asks. Do not start Task 7 before the owner says OK.
- [ ] **Step 6: Commit** `git add tools/report/library.json tools/report/test_library.py` → `feat(report): V2 library meanings for the why chapter`.

### Task 2: Validator V2

**Files:**
- Modify: `tools/report/validate.py`
- Create: `tools/report/testkit.py` (`minimal_content(facts: dict) -> dict`, shared by Tasks 2 and 5)
- Test: `tools/report/test_validate.py` (create)

**Interfaces:**
- Consumes: `LIB` from Task 1.
- Produces: `main(facts_path, content_path) -> int` unchanged; `REQUIRED` adds `why.who`, `why.drives`, `why.likes`, `why.dislikes`, `why.drains`, `why.needs`, `why.approach`; new check: every sentence in a `why.*` section cites at least one `fact:` ref; `BANNED` adds `"ebook"`, `"workbook"`, `"read your own chart"`.

- [ ] **Step 1: Write the failing tests.** `testkit.minimal_content` builds a minimal valid content dict for `samples/demo-facts.json`: one sentence per `REQUIRED` section, for example `{"text": "Your Sun is in Pisces.", "src": ["fact:items.sun.sign"]}` (use the demo's real signs). Write it to a temp dir and call `validate.main`.
  - `test_minimal_content_passes`: returns 0.
  - `test_missing_why_section_fails`: remove `why.drains` → returns 1.
  - `test_why_sentence_without_fact_fails`: a `why.likes` sentence with only `lib:` refs → returns 1.
  - `test_ebook_word_fails`: a sentence containing "workbook" → returns 1.
- [ ] **Step 2: Run** `PYTHONIOENCODING=utf-8 py -m pytest tools/report/test_validate.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the three changes above in `validate.py`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Also run V1 content: `PYTHONIOENCODING=utf-8 py tools/report/validate.py private-files/report-samples/michal-facts.json private-files/report-samples/michal-content.json` → FAIL only with "missing section why.*" lines (proves no other rule broke).
- [ ] **Step 5: Commit** → `feat(report): validator requires the why chapter`.

### Task 3: Saturn return dates in the engine

**Files:**
- Create: `tools/report/returns.mjs`
- Modify: `tools/report/facts.mjs`
- Test: `tools/tests/report-returns.test.mjs` (create)

**Interfaces:**
- Produces in `returns.mjs`:
  - `findPasses(eph, body, natalLon, fromJd, toJd) -> number[]`: TT Julian dates where `body` is exactly at `natalLon`. Clip `fromJd`/`toJd` to `eph.range`. Scan in 1-day steps on `d = wrap180(eph.lon(body, jd) - natalLon)`; a pass is a sign change with `|d| < 20` on both sides; refine by bisection to 0.001 day.
  - `groupReturns(passes, birthJd, todayJd) -> [{ n, first, last, passes, ageStart, status }]`: passes closer than 400 days form one return. `first`/`last` are `YYYY-MM-DD` (UTC, from JD). `ageStart` = whole years from birth to `first`. `status` = `"past"` if `last < todayJd`, `"now"` if `first <= todayJd <= last`, else `"coming"`. `n` counts from 1.
- `facts.mjs` adds `saturnReturns: groupReturns(findPasses(eph, 'Saturn', natalSaturnLon, birthJd + 20*365.25, birthJd + 95*365.25), birthJd, todayJd)`. Birth JD: `eph.ttFromUtc(utcMs / 86400000 + 2440587.5)`.

- [ ] **Step 1: Write the failing tests** (load the ephemeris from disk the way `tools/tests/ephemeris.test.mjs` does). Made-up natal point: `natal = eph.lon('Saturn', JD of 2000-01-01)`.
  - `passes are exact`: every JD from `findPasses` over 2000-2100 has `|wrap180(lon - natal)| < 0.01`.
  - `first return near age 29`: `groupReturns(...)[0].ageStart` is 28 or 29; `passes` is 1 or 3.
  - `clipped at the ephemeris end`: `findPasses` with `toJd = 2600000` returns no JD above `2506072.5` and does not throw.
  - `status`: with `todayJd` = JD of 2026-10-26, return 1 (about 2029) has `status === "coming"`; with `todayJd` = JD of 2040-01-01 it is `"past"`.
- [ ] **Step 2: Run** `node --test tools/tests/report-returns.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `returns.mjs` and wire it into `facts.mjs`.
- [ ] **Step 4: Run** the test (PASS), then `node tools/report/facts.mjs tools/report/samples/demo-input.json tools/report/samples/demo-facts.json` and check that `saturnReturns` has 2 or 3 entries.
- [ ] **Step 5: Commit** `returns.mjs`, the test, `facts.mjs`, `samples/demo-facts.json` → `feat(report): compute Saturn return dates`.

### Task 4: Text helpers for the builder

**Files:**
- Create: `tools/report/report_text.py`
- Test: `tools/report/test_report_text.py` (create)

**Interfaces:**
- Consumes: `LIB` (Task 1), facts shape from `facts.mjs`.
- Produces:
  - `short_word(body: str) -> str`: `LIB["planet"]` then `LIB["point"]` `short` (key without spaces, so "North Node" → `NorthNode`); missing → `""`.
  - `fill_aspect(a: str, typ: str, b: str) -> str`: `readAsYou` with "A" → `"Sun (who you are)"`, "B" → `"Mars (your energy)"`; a body with no short word prints the name alone; types without `readAsYou` fall back to the `keyword`. Example: `fill_aspect("Sun", "sextile", "Mars") == "Sun (who you are) helps Mars (your energy) when you make the effort."`
  - `reason_line(src: list[str], facts: dict) -> str`: only `fact:` refs. `items.<body>.sign` + `items.<body>.house` of the same body → `"Moon in Pisces, 2nd house"`; `aspects[i]` → `"Moon square Neptune"`; `patterns[i]` → `"Stellium in Libra"` or `"T-square"`; `items.balance.<el>` → `"4 air"`; `chartRuler` → `"Chart ruler Saturn"`; `items.bigThree.rising` → `"Rising in Aquarius"`. Other refs are skipped. Keep first-seen order, no duplicates, join with `" · "`.
  - `RULER_STEPS(rising: str, ruler: str, sign: str, house: int) -> list[str]`: 4 fixed sentences: "Every sign has a ruling planet. Think of it as the boss of that sign." / "Your Rising sign is {rising}. Its boss is {ruler}." / "So {ruler} is the boss of your whole chart." / "{ruler} sits in {sign}, in your {nth} house. That is where your energy goes first."
- [ ] **Step 1: Write the failing tests** with `samples/demo-facts.json`: the `fill_aspect` example above; `fill_aspect("Sun", "sextile", "Xyz")` ends with `"helps Xyz when you make the effort."`; `reason_line(["fact:items.sun.sign", "fact:items.sun.house", "lib:sign.Pisces.gift", "fact:nope"], demo)` equals `"Sun in Pisces, <demo house>th house"` (read the house from the demo file); `reason_line(["lib:x"], demo) == ""`; `reason_line(["fact:aspects[0]"], demo) == "Mars conjunction Midheaven"`.
- [ ] **Step 2: Run** `PYTHONIOENCODING=utf-8 py -m pytest tools/report/test_report_text.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** `report_text.py` (reuse the `ORD` ordinal rule from `build_report.py`; move it here and import it back).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** → `feat(report): filled aspect sentences and chart reason lines`.

### Task 5: Builder V2 layout

**Files:**
- Modify: `tools/report/build_report.py`
- Test: `tools/report/test_build.py` (create)

**Interfaces:**
- Consumes: Task 3 `facts["saturnReturns"]`; Task 4 helpers; content section ids `why.*`, `clash`, `saturnReturn` (the last two optional).
- Produces: `build(facts, content, out)` unchanged in signature.

Changes, in page order:
1. Styles: `body` and `ask` 12 pt / leading 17.5; `small` 9.5 / 13.5; `cell` and `cellb` 10.5 / 14; `label` 8 / 11; `kicker` 8.5 / 12. Retune table column widths so nothing wraps badly.
2. After "Start here": new page "Why you are like this", intro line (code): "Seven questions about you. Each answer comes from your chart." For each of the 7 ids: an `h2` heading with the question text from the spec, `r.para(id)`, then `Paragraph("From your chart: " + reason_line(all src of that section), "small")` if not empty.
3. Wheel legend: "Blue lines join planets that work well together. Red lines join planets that want different things. You feel a red line as an inner push and pull." Then, if any red line exists (same filter as the wheel: tense major aspect, both bodies in the first 10 glyphs), a card "Where you pull two ways" listing `fill_aspect(...)` per red line, then `r.para("clash")`.
4. Chart ruler block: `RULER_STEPS(...)` paragraphs before the key strip. The modern ruler is not printed.
5. Aspects page: the explanation goes above the table: "Each row joins two parts of you. Read the last column as a sentence. The smaller the orb, the more you feel it." The last column uses `fill_aspect`. Remove the "Read 'A' and 'B'..." line.
6. "Dates to watch": for each `saturnReturns` entry, one row: "Saturn return {n}: {Month YYYY} to {Month YYYY} (age {ageStart}) · {past|now|coming}". Then `LIB["nextSteps"]["saturnReturn"]["text"]`, `["practical"]`, then `r.para("saturnReturn")`.
7. Delete "What to try next" and the "Transit" glossary row.
8. "About this report": "...using only a fixed list of approved meanings." (no workbook name).

- [ ] **Step 1: Write the failing tests.** Build the PDF for `samples/demo-facts.json` with `testkit.minimal_content` from Task 2 into a temp file. Read it with `pypdf`.
  - `test_v2_sections_present`: text contains "Why you are like this", "From your chart:", "Saturn return 1:", "is the boss of your whole chart".
  - `test_v1_parts_removed`: text has no "What to try next", "Progressions", "Read Your Own Chart", "Read 'A' and 'B'".
  - `test_aspect_rows_filled`: text contains "Mars (your energy)".
  - `test_no_red_lines_no_box`: copy the demo facts, drop every tense major aspect, build → no "Where you pull two ways", no exception.
- [ ] **Step 2: Run** `PYTHONIOENCODING=utf-8 py -m pytest tools/report/test_build.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the 8 changes.
- [ ] **Step 4: Run** all report tests: `PYTHONIOENCODING=utf-8 py -m pytest tools/report -q`. Expected: PASS. Open the demo PDF and look at every page (render pages to PNG with `pypdfium2` or the PDF skill) for overlaps and bad wraps.
- [ ] **Step 5: Commit** → `feat(report): V2 layout (why chapter, clashes, filled aspects, Saturn return dates, bigger font)`.

### Task 6: Prompts and job ticket V2

**Files:**
- Modify: `tools/report/PROMPT.md`

- [ ] **Step 1:** WRITER prompt: LIBRARY is "the report's approved meanings" (no ebook). Add the new sections and this source map (the writer must cite at least 2 sources per `why.*` answer):
  - `why.who`: Sun sign, Sun house, `planet.Sun.means`, North Node sign and house.
  - `why.drives`: `sign.<Sun>.drives`, Mars sign and house, chart ruler sign `drives`, stellium if any.
  - `why.likes`: `sign.<Venus>.likes`, `sign.<Moon>.likes`, `house.<Venus house>.pulls`, houses with a stellium `pulls`.
  - `why.dislikes`: `dislikes` and `shadow` of Sun, Moon and Rising signs.
  - `why.drains`: `sign.<Moon>.drains`, tense aspects to Moon or Venus, weakest element.
  - `why.needs`: `sign.<Moon>.needs`, Moon house, Part of Fortune, North Node.
  - `why.approach`: Rising sign, chart ruler sign and house, planets near the AC.
  - `clash`: 2 to 4 sentences on the red lines, practical, "you may notice it when...".
  - `saturnReturn`: 1 to 3 sentences. Use `status`: past → a look-back question; now or coming → "may" sentences. Never write a date or year (code prints them).
- [ ] **Step 2:** Update the "Job ticket" section ids and remove transits, synastry, progressions.
- [ ] **Step 3: Commit** → `docs(report): V2 prompts and job ticket`.

### Task 7: Make the owner's V2 report (private data, nothing committed)

**Files:**
- Private: `private-files/report-samples/michal-facts.json`, `michal-content-v2.json`
- Output: `D:\poligon\Michal_birth-chart_V2.pdf`
- Modify: `docs/HANDOFF-chart-report.md`

- [ ] **Step 1:** Rebuild facts: `node tools/report/facts.mjs private-files/report-samples/michal-input.json private-files/report-samples/michal-facts.json`.
- [ ] **Step 2: WRITER.** Write `michal-content-v2.json` with the V2 WRITER prompt (reuse V1 sentences where they still fit; rewrite the intro without the ebook).
- [ ] **Step 3:** Validate: `PYTHONIOENCODING=utf-8 py tools/report/validate.py private-files/report-samples/michal-facts.json private-files/report-samples/michal-content-v2.json` → `RESULT: PASS`.
- [ ] **Step 4: CHECKER.** Run the CHECKER prompt in a fresh subagent that gets only FACTS, LIBRARY and CONTENT. Fix every FAIL until `TOTAL FAIL = 0` (max 3 loops).
- [ ] **Step 5: HUMANIZER**, then validate again → PASS.
- [ ] **Step 6:** Build: `PYTHONIOENCODING=utf-8 py tools/report/build_report.py private-files/report-samples/michal-facts.json private-files/report-samples/michal-content-v2.json D:/poligon/Michal_birth-chart_V2.pdf`. Look at every page.
- [ ] **Step 7:** Update `docs/HANDOFF-chart-report.md` (V2 state, the decisions in the spec, next step: owner reads V2, then the shop plan). Commit the handoff only → `docs: handoff after chart report V2`.

---

## Self-review notes
- Spec coverage: items 1-8 map to Tasks 1, 4, 5, 3, 6. Product rules (no ebook name, reflection only) are in Global Constraints and Task 2.
- Owner TODO list (`docs/EBOOK-CHANGES-TODO.md`): no new ebook or tool change comes from this plan. Items 9-11 stay OPEN for the free ebook.
