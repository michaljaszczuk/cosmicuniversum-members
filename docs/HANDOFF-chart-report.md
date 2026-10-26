# Handoff: paid birth chart report (read this first in a new session)

Date: 2026-10-26 (V2). Branch: `feat/chart-tools`. Committed, not pushed.

## The idea
Sell ready-made birth chart reports as a digital product. The chart tool computes the facts. An AI writes the reading sentences. A script checks them. A script builds the PDF.

## State now
- V2 PDF for the test customer: `D:\poligon\Michal_birth-chart_V2.pdf` (23 pages). V1 is still at `..._V1.pdf`.
- V2.1 (`D:\poligon\Michal_birth-chart_V2.1.pdf`): each red line now shows 3 real-life examples (`tension` in `library.json`, 41 planet pairs). The `clash` text no longer lists the red lines; it says what they share and ends with a question. The owner APPROVED the examples (2026-10-26), list in `D:\poligon\V2_red_line_examples_CHECK.txt`. The new clash sentences were checked by me, not by a separate checker.
- V2.2 (`D:\poligon\Michal_birth-chart_V2.2.pdf`, 19 pages, content `private-files/report-samples/michal-content-v2.2.json`, 95 sentences): body text 13 pt (all sizes x 13/12). The 7 why answers ARE the Big Three chapter now (Sun: who, drives; Moon: needs, drains; Rising: approach + chart ruler; then likes, dislikes). No separate bigThree.* sections, no chart story. Owner rule: say each thing once. `validate.py` rejects a sentence that shares 4 content words in a row with an earlier one (3 = warning). Headings never end a page (`keepWithNext` + `keep_heads()`). The new sentences were checked by me, not by a separate checker.
- V2 design: `docs/superpowers/specs/2026-10-26-chart-report-v2-design.md`. Plan: `docs/superpowers/plans/2026-10-26-chart-report-v2.md`.
- V2 content: `private-files/report-samples/michal-content-v2.json` (206 sentences, grade 4.6). CHECKER ran as a separate agent: round 1 = 30 FAIL, round 2 = 2 FAIL, round 3 = 0. HUMANIZER skipped (text already plain; a rewrite would need another checker round).
- Test data: the owner's own chart in `private-files/report-samples/` (git-ignored, this PC only). The GitHub repo is PUBLIC: never commit real birth data.
- NEXT: the owner reads V2 as a customer. Then the SHOP plan (separate): own order form with real town coordinates, then Gumroad checkout with the order number, then Gumroad ping, then the pipeline, then a Sender.net email with the PDF, then delete the data.

## Product decisions (2026-10-26)
- The ebook and the chart tool are FREE hooks. The report is the only paid product. The report never names the ebook.
- `library.json` is the report's own meaning list. Core fields match the free ebook. Report-only fields: `drives`, `likes`, `dislikes`, `drains`, `needs` (signs), `pulls` (houses), `short` (planets and points), `readAsYou` (aspects), `nextSteps.saturnReturn.practical`. The owner approved them on 2026-10-26. `tension` (red line examples) approved 2026-10-26.
- Payment: Gumroad (it allows one-off birth chart readings sold for reflection). Polar bans horoscopes. Lemon Squeezy was dropped. Copy stays reflection, never prediction.
- The owner runs it as an unregistered activity in Poland (limit 10,813.50 zl per quarter in 2026). GDPR: keep birth data only until delivery, then delete it.

## Files (all in `tools/report/`)
| File | What it does |
|---|---|
| `PROMPT.md` | The 3 agent prompts (WRITER, CHECKER, HUMANIZER), the pipeline, the job ticket, the data to ask the customer. |
| `library.json` | The ONLY meanings the AI may use. Copied from ebook v2, with page numbers. House 9 says "study", not "higher study". |
| `facts.mjs` | Builds facts JSON with the site engine (`public/tools/js`). Adds near-angle planets, empty houses, dignity, real MC house. Run: `node tools/report/facts.mjs <input.json> <facts.json>` |
| `validate.py` | Rule checks: every sign/house/degree/planet/aspect must be in the cited sources, "X is in Sign, Nth house" must match the chart, max 22 words, no dashes, banned words, no "you will", reading grade max 8. Run: `PYTHONIOENCODING=utf-8 py tools/report/validate.py <facts> <content>` |
| `build_report.py` | Builds the PDF (reportlab, ebook fonts from `tools/ebook/typo.py`, DejaVu Sans for glyphs). Run: `PYTHONIOENCODING=utf-8 py tools/report/build_report.py <facts> <content> <out.pdf>` |
| `fonts/DejaVuSans.ttf` | Glyph font (Noto Sans Symbols lacks ☉ ℞ ⊗). Licence in `fonts/LICENSE-dejavu.txt`. |
| `samples/demo-*.json` | Made-up demo person (Alex, Kraków) for tests: input and facts only. The owner's real sample (with content: 163 sentences, grade 4.5) is in `private-files/report-samples/`. |

## How the content was made (V1)
- I (Claude) wrote the owner's content file as the WRITER, then did the CHECKER and HUMANIZER steps myself (one fix: "talk" not in the air meaning; removed many "So ..." openings).
- In production the CHECKER must be a separate model or session.
- Validator self-test: 5 planted false sentences, all 5 caught.

## Known limits and open points
- "Zero hallucination" is the goal, not a guarantee: the validator checks names and numbers, not every shade of meaning.
- Paragraphs are cut every 2 sentences by code. Topics can mix inside a paragraph. V2 idea: let the writer mark paragraph breaks.
- Small towns are often not in the tool city list (`public/tools/data/cities.json`). For the test chart the nearest big city moved only the Vertex, by 1°. The shop must use real town coordinates.
- Tool bug found: worksheet always prints Midheaven house 10. Logged in `docs/EBOOK-CHANGES-TODO.md` item 8. The report prints the real whole-sign house (11 here).
- Not decided yet: price, shop, how the customer enters data, delivery, whether the AI steps run by API.

## Related
- Ebook and tool fixes from beginner testing: `docs/EBOOK-CHANGES-TODO.md` (items 1-8, all OPEN).
- Beginner step-by-step guide (edited in testing): `D:\poligon\chart_stepbystep.txt`.
- Chart tool and ebook v2 handoff: `docs/HANDOFF-tools-and-ebook-v2.md`.
