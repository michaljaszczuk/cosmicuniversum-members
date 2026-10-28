# Handoff: paid birth chart report (read this first in a new session)

Date: 2026-10-26 (V2), shop built 2026-10-28. Branch: `feat/chart-tools`. V3 is pushed; the shop commits are local only.

## The idea
Sell ready-made birth chart reports as a digital product. The chart tool computes the facts. An AI writes the reading sentences. A script checks them. A script builds the PDF.

## State now
- V2 PDF for the test customer: `D:\poligon\Michal_birth-chart_V2.pdf` (23 pages). V1 is still at `..._V1.pdf`.
- V2.1 (`D:\poligon\Michal_birth-chart_V2.1.pdf`): each red line now shows 3 real-life examples (`tension` in `library.json`, 41 planet pairs). The `clash` text no longer lists the red lines; it says what they share and ends with a question. The owner APPROVED the examples (2026-10-26), list in `D:\poligon\V2_red_line_examples_CHECK.txt`. The new clash sentences were checked by me, not by a separate checker.
- V2.2 (`D:\poligon\Michal_birth-chart_V2.2.pdf`, 19 pages, content `private-files/report-samples/michal-content-v2.2.json`, 95 sentences): body text 13 pt (all sizes x 13/12). The 7 why answers ARE the Big Three chapter now (Sun: who, drives; Moon: needs, drains; Rising: approach + chart ruler; then likes, dislikes). No separate bigThree.* sections, no chart story. Owner rule: say each thing once. `validate.py` rejects a sentence that shares 4 content words in a row with an earlier one (3 = warning). Headings never end a page (`keepWithNext` + `keep_heads()`). The new sentences were checked by me, not by a separate checker.
- V3 (`D:\poligon\Michal_birth-chart_V3.pdf`, 21 pages, content `private-files/report-samples/michal-content-v3.json`, 111 sentences, grade 4.7, PASS). Design: `docs/superpowers/specs/2026-10-27-report-v3-design.md`, plan: `docs/superpowers/plans/2026-10-27-report-v3.md`. New: "Try this week" step under Sun/Moon/Rising; "Love and work" (love.needs, love.draws, work.suits, work.daily); "Your birth rune" (Pennick half-month calendar, `tools/report/birthsigns.mjs`, edge line where Vogue Scandinavia differs, Noto Sans Runic font); "Your life path number" (method reduce-parts, steps printed); "Where they agree" (shared theme tags of Sun sign, rune and number, computed in FACTS as `agree`). Patterns page removed (TODO 12). New chapters use a conditional page break (90 mm), so they fill half-empty pages. No hour rune (only one source). The new library texts (runes, lifePath, theme, sign love/partner/work/workday/step/themes) were checked by the owner in `D:\poligon\V3_meanings_CHECK.txt` and approved on 2026-10-27.
- V2 design: `docs/superpowers/specs/2026-10-26-chart-report-v2-design.md`. Plan: `docs/superpowers/plans/2026-10-26-chart-report-v2.md`.
- V2 content: `private-files/report-samples/michal-content-v2.json` (206 sentences, grade 4.6). CHECKER ran as a separate agent: round 1 = 30 FAIL, round 2 = 2 FAIL, round 3 = 0. HUMANIZER skipped (text already plain; a rewrite would need another checker round).
- Test data: the owner's own chart in `private-files/report-samples/` (git-ignored, this PC only). The GitHub repo is PUBLIC: never commit real birth data.
- V3 is pushed (`origin/feat/chart-tools`). 75 Python + 6 node tests pass. Run node tests with explicit files (`node --test tools/tests/report-birthsigns.test.mjs`), not the folder (fails on Windows).
- SHOP (2026-10-27): design `docs/superpowers/specs/2026-10-27-report-shop-design.md`, APPROVED by the owner 2026-10-28. Flow: own order form (Cloudflare Pages) -> R2 pending order -> Gumroad checkout `?order=<id>` -> Gumroad ping, verified by the Gumroad API -> VPS worker (Ubuntu, polls each minute, Anthropic API key in `/etc/cosmic-report/env`) runs the pipeline -> PDF to R2 -> Sender.net email with a 30-day link -> delete.
- SHOP BUILT (2026-10-28), branch `feat/chart-tools`: 22 local commits on top of `origin/feat/chart-tools`, NOT pushed, NOT deployed. Owner chose "keep the branch as-is": push or merge only after the Gumroad test purchase works, and only when the owner says so. Before any push: scan the diff for the owner's birth data (scan on 2026-10-28: 0 hits).
  - Plan: `docs/superpowers/plans/2026-10-28-report-shop.md` (13 tasks, all done; executed natively, then one fresh Opus reviewer).
  - Code: form `public/report/` (town index `public/report/places/`, GeoNames cities500 + admin1 names, built by `tools/build/make-places.mjs`), time check `public/tools/js/timewindow.js`, Functions `functions/api/report/*` + `functions/r/[token].js` + `functions/_shared/{shop,order-check,sale}.js`, worker `tools/shop/` (`worker.py once|daily|retry <id>|recheck <id>|resend <email>`), systemd units `tools/shop/systemd/`.
  - Owner docs: `docs/shop/OWNER-CHECKLIST.md` (all setup steps), `docs/SHOP-VPS-SETUP.md` (VPS commands + section 7b "Alerts and what to do"), `docs/shop/EMAILS.md` (4 email texts).
  - Tests: `PYTHONIOENCODING=utf-8 py -m pytest tools/report tools/shop -q` (123 pass) and each `node --test tools/tests/<file>.test.mjs` (17 files pass). Check of the Functions bundle: `npx wrangler pages functions build --outdir <tmp>`.
  - Local run: `npx wrangler pages dev public --port 8788 --binding TURNSTILE_SECRET=1x0000000000000000000000000000000AA --binding WORKER_SECRET=local-test-worker --binding GUMROAD_PRODUCT_URL=https://example.gumroad.com/l/report --binding GUMROAD_PRODUCT_ID=prod-1`. Do not read or overwrite `.dev.vars` (owner's file). Git Bash `curl --data` breaks non-ASCII (use `--data-binary @file.json`).
  - Design points: Cloudflare holds no Sender or Anthropic key. Alerts and waitlist sign-ups wait in R2 (`alerts/`, `waitlist/`) until the worker sends them and acks them (`/api/report/inbox-ack`); an alert the worker cannot email is parked again (`/api/report/alert`). Orders that fail 3 leases come back in `/next` as `failedNow` so the worker sends the "finished by hand" email. AI steps: 20-minute limit, 5-minute per-call timeout, SIGTERM ends the order as FAILED + alert. A wrong `GUMROAD_PRODUCT_ID` keeps the pending order (`productMismatchAt`) for `worker.py recheck <id>`; orders get 503 while Gumroad vars are empty. Broken JSON in the queue goes to `orders/broken/` with an alert.
  - Gumroad facts (checked in the Gumroad source, antiwork/gumroad): the ping's `product_id` has a different format from the Sales API `product_id`; only the API one is compared, owner copies it from `GET /v2/products`. API sale fields used: `product_id`, `email`, `purchase_email`, `refunded`, `chargedback`, `price` (cents). Pings retry only on 499/500/502/503/504.
  - Not verified yet (needs the real services): Sender.net send + subscriber payloads, and the custom field tag `{$town}`; the real AI run (only a fake model so far). Both are checked at the Gumroad test purchase.
  - Far-north waitlist (owner decision 2026-10-28): towns past 66° show a "tell me when my town works" box; email + town go to Sender group "far-north waitlist" (`SENDER_POLAR_GROUP`, field `town`); owner gets a count alert without addresses.
  - Deferred shop minors (from the final review): 66° check is now in the form too (fixed); server does not re-check `riskAccepted` against the time window; kept pending orders, orphans and their `sales/` records are never auto-deleted; if both status calls fail after the email, a report can be sent twice; ping race gives a noise alert; apostrophe not %-escaped in the download `filename*`; `public/report/places/sa.json` is 904 KB; `tools/shop/__pycache__/` not in `.gitignore`; env file mode 640 root:cosmic (spec said 600).
- NEXT: the owner works through `docs/shop/OWNER-CHECKLIST.md` (Gumroad product + ping URL + API token + product id + beta code, Sender.net transactional plan + domain + 4 templates + 2 groups + `town` field, Cloudflare secrets with `!` commands, VPS setup, price, feedback form tool). Then deploy and the Gumroad test purchase on the real site (step 7), then the beta (5, then 45). Then ask the owner about push/merge.
- Texts (2026-10-28): the owner approved all shop texts: form copy and error messages, consent ticks, far-north and no-time waitlist boxes, privacy note, terms, the 4 emails. Contact email on the privacy and terms pages: hello@cosmicuniversum.com.
- Polar towns (owner decision 2026-10-28): the shop refuses birth towns past 66° N/S (form and server). The engine (`angles()` in `public/tools/js/houses.js`) gives no Ascendant past the polar circle (~66.56°). Later, only if people ask: compute the eastern-horizon Ascendant at all latitudes, check it against Swiss Ephemeris at polar places, raise `maxLatitude`, check the free tool and the ebook worksheet. Whole Sign houses already work there.
- Deferred minors from the V3 review: theme check runs only in `agree`; paraphrases are missed; spec says edge `{other, change}` but code emits `{other}`; PDF number chain comes from the date, not `steps`; Work strip MC house vs "house 10" prompt wording; `__pycache__` .pyc files are tracked in git (do not commit them).
- Local branch `backup/v3-before-scrub` still holds the owner's real birth date. Never push it. Delete it when the owner agrees (`git branch -D backup/v3-before-scrub`).

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
- Not decided yet: price. The rest is in the shop design.

## Related
- Ebook and tool fixes from beginner testing: `docs/EBOOK-CHANGES-TODO.md` (items 1-8, all OPEN).
- Beginner step-by-step guide (edited in testing): `D:\poligon\chart_stepbystep.txt`.
- Chart tool and ebook v2 handoff: `docs/HANDOFF-tools-and-ebook-v2.md`.
