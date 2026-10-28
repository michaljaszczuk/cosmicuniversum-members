# Report Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Owner's choice for this plan:** native execution (superpowers:executing-plans), then ONE final reviewer on the whole branch.

**Goal:** Sell the V3 birth chart report automatically: order form → Gumroad → Cloudflare queue → VPS worker (AI + validator + PDF) → Sender.net email → data deleted on schedule.

**Architecture:** Cloudflare Pages holds the form, a static town index and small Functions that keep every order as a JSON file in R2, one folder per status. The VPS never accepts calls: a Python worker polls the queue API every minute, runs `facts.mjs` → AI steps → `validate.py` → `build_report.py`, uploads the PDF and emails it. Cloudflare holds no Sender or Anthropic key; alerts and waitlist sign-ups wait in R2 until the worker picks them up.

**Tech Stack:** Cloudflare Pages Functions (JS, R2 binding `FILES`), plain browser JS (no framework), Node 20+ (`node:test`), Python 3.12+ (`pytest`, `anthropic`, `requests`, `reportlab`), systemd on Ubuntu.

**Spec:** `docs/superpowers/specs/2026-10-27-report-shop-design.md` (read it with this plan). Background: `docs/HANDOFF-chart-report.md`, `tools/report/PROMPT.md`.

## Global Constraints

- The GitHub repo is PUBLIC. Tests and docs use only the made-up demo person (`tools/report/samples/demo-input.json`, Alex, Kraków). Never real birth data. Before every push: `git diff origin/feat/chart-tools --stat` and scan the diff for real dates, times or towns; ask the owner before pushing.
- Never `git add` the tracked `tools/report/__pycache__/*.pyc` files. Stage files by exact path only.
- Node tests run one file at a time: `node --test tools/tests/<file>.test.mjs` (the folder form fails on Windows). Python tests: `py -m pytest <path> -q`.
- Logs and error reasons: order id, step, status, time, tokens, cost. Never a name, email, date, time, town or sentence text.
- Secrets are never in git or logs. Cloudflare secrets: `TURNSTILE_SECRET`, `PING_SECRET`, `WORKER_SECRET`, `GUMROAD_ACCESS_TOKEN`. Cloudflare vars (`wrangler.toml`): `GUMROAD_PRODUCT_ID`, `GUMROAD_PRODUCT_URL`, `TURNSTILE_SITEKEY` (exists). VPS env file `/etc/cosmic-report/env` (mode 600): `ANTHROPIC_API_KEY`, `WORKER_SECRET`, `SENDER_API_TOKEN`, `OWNER_ALERT_EMAIL`, `SHOP_BASE_URL=https://cosmicuniversum.com`, `MODEL_WRITER=claude-sonnet-5-5`, `MODEL_CHECKER=claude-opus-5-5`, `MODEL_HUMANIZER=claude-sonnet-5-5`, `SENDER_TPL_READY`, `SENDER_TPL_DELAY`, `SENDER_TPL_ALERT`, `SENDER_TPL_FEEDBACK`, `SENDER_WAITLIST_GROUP`, `FEEDBACK_FORM_URL` (optional).
- Times: unpaid order deleted after 24 h; birth data removed at delivery; PDF, download token and order record deleted 30 days after delivery; lease 30 minutes; at most 3 writer rounds.
- Order id: 20 random characters `[a-z0-9]`. Download token: 32 random characters `[a-z0-9]`.
- Time safety check: ±3 hours around the given time, 1-minute steps; Rising, Moon and Midheaven signs must stay the same. "How sure" values in minutes: exact 0, 15, 30, 60.
- Customer copy: plain English, short sentences, no dashes, reflection never prediction, no promises of results. All customer texts go to the owner for approval before launch.
- The AI never gets `input`, `lons`, `timeCheck`, `items.name`, `items.birthPlace`, `items.birthDate`, `items.birthTime`, or the dates in `saturnReturns` (only `n` and `status`).

## Review Focus

1. **Gumroad API down while the ping arrives.** The customer paid. Expected: the ping answers 502 so Gumroad retries, an alert is written, and the pending order is marked `pingFailedAt` so the 24 h cleanup never deletes it. Test in Task 6 and Task 7 (cleanup).
2. **Customer pays with a different email on Gumroad than on the form.** Expected: the order still becomes PAID, the report goes to the form email, `emailMismatch: true` is saved and the owner gets an alert. Test in Task 6.
3. **Birth town above 66° latitude.** The Rising sign can be undefined there. Expected: the form and the server refuse the order before payment with a clear message. Test in Task 5 (server) and Task 2 (window returns `null` when the Ascendant is undefined).
4. **Time window crosses midnight.** Expected: the time check line says "23:10 the day before", not just "23:10". Test in Task 2.
5. **Worker dies mid-order again and again** (killed, out of memory). Expected: after 3 expired leases the order goes to FAILED with an owner alert, not an endless loop. Test in Task 7.

---

## File map

| File | Job |
|---|---|
| `tools/build/make-places.mjs` | GeoNames `cities500.txt` → `public/report/places/<2 letters>.json` |
| `public/report/places/*.json` | Static town index (generated, committed) |
| `public/report/js/places.js` | Browser town search over the static index |
| `public/tools/js/timewindow.js` | Time safety window (shared by browser and `facts.mjs`) |
| `tools/report/facts.mjs` (modify) | Accepts `fold` and `sure`; adds `timeCheck` |
| `tools/report/build_report.py` (modify) | Prints the time check line |
| `tools/report/validate.py` (modify) | `check()` returns structured errors |
| `functions/_shared/shop.js` | Ids, R2 helpers, auth, alerts, Turnstile, JSON responses |
| `functions/_shared/order-check.js` | Server validation of a form order |
| `functions/api/report/order.js` | `POST` new order |
| `functions/api/report/waitlist.js` | `POST` no-time waitlist email |
| `functions/api/report/gumroad-ping.js` | Gumroad ping |
| `functions/api/report/next.js`, `file/[id].js`, `status/[id].js`, `retry/[id].js`, `delivered.js`, `feedback-due.js`, `inbox.js`, `cleanup.js` | Queue API for the VPS |
| `functions/r/[token].js` | PDF download |
| `public/report/index.html`, `report.css`, `js/order-form.js`, `js/order-page.js` | Order form |
| `public/report/privacy/index.html`, `public/report/terms/index.html` | Legal drafts |
| `tools/tests/shop/fake-r2.mjs`, `tools/tests/shop/ctx.mjs` | Test fakes |
| `tools/shop/config.py`, `api.py`, `ai_input.py`, `sender.py`, `pipeline.py`, `worker.py`, `requirements.txt`, `conftest.py`, `test_*.py` | VPS worker |
| `tools/shop/systemd/*` | Timer and service units |
| `docs/SHOP-VPS-SETUP.md`, `docs/shop/OWNER-CHECKLIST.md`, `docs/shop/EMAILS.md` | Owner guides and email texts |

## R2 layout and order record (all tasks use this)

```
orders/<status>/<id>.json   status ∈ pending | paid | working | delivered | failed
orders/orphan/<sale_id>.json
sales/<sale_id>.json        { id }            (idempotency index)
reports/<id>.pdf
tokens/<token>.json         { id, name, expiresAt }
alerts/<ms>-<rand>.json     { text, at }
waitlist/<rand>.json        { email, at }
```

Order record:

```js
{ id, status, createdAt, email, name,
  birth: { date: 'YYYY-MM-DD', time: 'HH:MM', fold: null|0|1,
           place: 'Kraków, PL', lat, lon, tz,
           timeSource: 'record'|'parent'|'guess', sure: 0|15|30|60, riskAccepted: bool },
  consents: { privacy: true, waiver: true, at },
  // set later:
  sale_id, paidAt, test, beta, emailMismatch, pingFailedAt,
  leaseUntil, leases, failReason, deliveredAt, token, delayMailSent, feedbackSent }
```

Every R2 put of an order sets `customMetadata: { at: <ISO time that matters for this status> }` (pending: `createdAt`; paid: `paidAt`; working: `leaseUntil`; delivered: `deliveredAt`; failed: failure time) so list calls can sort and expire without reading bodies.

---

### Task 1: Town index from GeoNames cities500

**Files:**
- Create: `tools/build/make-places.mjs`, `public/report/js/places.js`, `public/report/places/*.json` (generated)
- Test: `tools/tests/report-places.test.mjs`

**Interfaces:**
- Produces: file format `public/report/places/<key>.json` = `{ v:1, tzs:[...], rows:[[name, country, admin1, lat, lon, tzIndex, pop], ...] }`, where `<key>` is the first 2 folded letters of the name or of any kept alias (`a-z` only; other first letters go to `_.json`). Rows sorted by pop, descending.
- Produces: `placeKey(q: string): string`, `searchPlaces(q: string, {fetch}) : Promise<{name, country, admin1, lat, lon, tz}[]>` (max 10, prefix match, folded), `findPlace({name, country, lat, lon}, {fetch}) : Promise<row|null>` (exact match, used by the server in Task 5).
- Consumes: `foldText` from `public/tools/js/places.js`. Alias rules copied from `tools/build/make-cities.mjs` (asciiname always; alternates for pop ≥ 100000).

- [ ] **Step 1: Get the source.** Download `https://download.geonames.org/export/dump/cities500.zip` into the scratchpad, unzip there. Do not commit it.
- [ ] **Step 2: Write the failing test** `tools/tests/report-places.test.mjs`. It builds a tiny index from a 5-line fixture string (fake towns, GeoNames column layout) by importing `buildIndex(lines: string[]) → Map<key, fileObject>` from `make-places.mjs`, then serves it through a fake fetch.

```js
test('small town found by prefix, folded', async () => {
  const r = await searchPlaces('zabk', { fetch: fakeFetch });   // fixture "Ząbki", pop 900
  assert.equal(r[0].name, 'Ząbki'); assert.equal(r[0].tz, 'Europe/Warsaw');
});
test('max 10, sorted by population', ...);           // fixture has 12 "Sa..." rows
test('one-letter query returns []', ...);            // needs 2 letters
test('findPlace exact match and miss', ...);         // lat off by 0.001 → null
test('placeKey', () => { assert.equal(placeKey('Łódź'), 'lo'); assert.equal(placeKey('1st'), '_'); });
```

- [ ] **Step 3: Run** `node --test tools/tests/report-places.test.mjs` → FAIL (module not found).
- [ ] **Step 4: Implement** `make-places.mjs` (CLI: `node tools/build/make-places.mjs <cities500.txt> <outDir>`, exports `buildIndex`) and `public/report/js/places.js`. `admin1` is GeoNames column 10 (helps tell same-name towns apart). Lat/lon rounded to 3 decimals, as `make-cities.mjs`.
- [ ] **Step 5: Run the test** → PASS.
- [ ] **Step 6: Generate** `node tools/build/make-places.mjs <scratch>/cities500.txt public/report/places`. Check: total size under 25 MB, no single file over 2 MB (`du -sh public/report/places; ls -S public/report/places | head -3`). If a file is over 2 MB, split that key to 3 letters (`<3 letters>.json`, `placeKey` returns 3 letters for keys listed in `public/report/places/_split.json`).
- [ ] **Step 7: Commit** `tools/build/make-places.mjs public/report/js/places.js public/report/places tools/tests/report-places.test.mjs` — `feat(shop): own town index from GeoNames cities500`.

### Task 2: Time safety window

**Files:**
- Create: `public/tools/js/timewindow.js`
- Test: `tools/tests/timewindow.test.mjs`

**Interfaces:**
- Produces: `timeWindow({utc: Date, lat, lon}, eph) → null | { rising, moon, mc, from: Date, to: Date, fromCause, toCause }`. Causes are `'Rising' | 'Moon' | 'Midheaven' | 'edge'` (`'edge'` = still the same at ±3 h). Returns `null` when `angles()` gives `asc === null`.
- Produces: `fitsWindow(w, utc: Date, sureMinutes: number) → boolean` = `utc − sure ≥ from && utc + sure ≤ to`.
- Produces: `clockText(d: Date, tz: string, birthDate: 'YYYY-MM-DD') → string`, e.g. `'06:42'`, `'23:10 the day before'`, `'00:20 the next day'`.
- Consumes: `angles` (`houses.js`), `signOf` (`chart.js`), `eph.longitude('Moon', jdTT)`, `eph.ttFromUtc`, `eph.ut1FromUtc`, `jdFromDate` (`time.js`).

- [ ] **Step 1: Write the failing tests** with the demo person (load ephemeris from disk as in `tools/tests/chart.test.mjs`).

```js
test('signs inside the window are the same, the next minute outside differs', () => {
  const w = timeWindow(demo, eph);
  assert.ok(w.from <= demo.utc && demo.utc <= w.to);
  // one minute past `to`: the named cause changed (unless 'edge')
});
test('near a change: 5 minutes before `to`', () => {
  const near = { ...demo, utc: new Date(w.to - 5 * 60000) };
  const w2 = timeWindow(near, eph);
  assert.equal(fitsWindow(w2, near.utc, 0), true);
  assert.equal(fitsWindow(w2, near.utc, 15), false);
});
test('far from a change: midpoint of the window fits 15 minutes', ...);
test('polar: lat 89 returns null', ...);
test('clockText across midnight', () => {
  assert.equal(clockText(new Date('1990-03-13T22:10:00Z'), 'Europe/Warsaw', '1990-03-14'), '23:10 the day before');
});
```

- [ ] **Step 2: Run** `node --test tools/tests/timewindow.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Walk 1-minute steps outward from the birth minute in each direction, up to 180 steps; stop at the first minute whose Rising, Moon or MC sign differs; `from`/`to` are the last equal minutes. Only compute `angles` and the Moon longitude per step (not `buildChart`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `public/tools/js/timewindow.js tools/tests/timewindow.test.mjs` — `feat(shop): birth time safety window`.

### Task 3: facts.mjs takes fold and sure; PDF prints the time check

**Files:**
- Modify: `tools/report/facts.mjs`, `tools/report/build_report.py` (birth data table, around line 383)
- Test: `tools/tests/report-facts.test.mjs` (new), `tools/report/test_build.py` (add tests)

**Interfaces:**
- Consumes: `timeWindow`, `fitsWindow`, `clockText` (Task 2).
- Produces: input.json gains optional `fold: 0|1` and `sure: 0|15|30|60`. If the local time is ambiguous and `fold` is 0 or 1, use `options[fold]`; otherwise throw as today. Facts gain `timeCheck: { rising, moon, mc, from: 'HH:MM[ the day before|the next day]', to, fromCause, toCause, sure, fits }` (`null` when `timeWindow` is `null`).
- Produces: PDF row `Time check` → `Your Rising sign stays <rising> from <from> to <to>.` Only when `facts.timeCheck` exists.

- [ ] **Step 1: Failing tests.** Node: run `facts.mjs` with `demo-input.json` plus `sure: 15` in a temp dir; assert `facts.timeCheck.rising === facts.items['bigThree.rising']` and `typeof fits === 'boolean'`. Second test: a fake input on a known autumn clock-change night (`2021-10-31`, `02:30`, `Europe/Warsaw`) with `fold: 1` gives `input.utc === '2021-10-31T01:30:00.000Z'`; without `fold` the process exits non-zero with "ambiguous". Python: `demo_facts()` plus a `timeCheck` dict → PDF text contains `Time check Your Rising sign stays`; without `timeCheck` it does not.
- [ ] **Step 2: Run** `node --test tools/tests/report-facts.test.mjs` and `py -m pytest tools/report/test_build.py -q` → new tests FAIL.
- [ ] **Step 3: Implement** in both files.
- [ ] **Step 4: Run both** → PASS. Run the whole report suite `py -m pytest tools/report -q` → all pass.
- [ ] **Step 5: Commit** the 4 files — `feat(report): facts take fold and sure; PDF prints the time check`.

### Task 4: Shop shared library and R2 fake

**Files:**
- Create: `functions/_shared/shop.js`, `tools/tests/shop/fake-r2.mjs`, `tools/tests/shop/ctx.mjs`
- Test: `tools/tests/shop-lib.test.mjs`

**Interfaces:**
- Produces (`shop.js`): `DAY`, `PENDING_TTL = DAY`, `KEEP = 30 * DAY`, `LEASE = 30 * 60000`, `MAX_LEASES = 3`; `randomId(n = 20)`; `safeEqual(a, b)`; `json(data, status = 200)` (adds `SECURITY_HEADERS` from `lib.js`); `orderKey(status, id)`; `getJson(bucket, key)`; `putOrder(bucket, order)` (writes `orders/<order.status>/<id>.json` with `customMetadata.at` per the table above); `moveOrder(bucket, order, toStatus, changes = {})` → new order object (put new, delete old); `findOrder(bucket, id) → {order, status} | null` (checks each status folder); `listAll(bucket, prefix)` (follows `truncated`/`cursor`, `include: ['customMetadata']`); `requireWorker(request, env) → Response | null` (401 unless `Authorization: Bearer <WORKER_SECRET>`); `addAlert(bucket, text)`; `verifyTurnstile(token, secret, ip, fetchFn = fetch) → Promise<boolean>` (POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`); `nowMs(env) = env.__now?.() ?? Date.now()` and `outFetch(env) = env.__fetch ?? fetch` (test hooks; production never sets them; every handler uses these two, never `Date.now()` or `fetch` directly).
- Produces (`fake-r2.mjs`): `class FakeR2` with `put(key, value, {customMetadata})`, `get(key)` → `{ text(), json(), arrayBuffer(), body, size, customMetadata } | null`, `delete(keyOrKeys)`, `list({prefix, cursor, limit, include})` (limit default 2 so paging is tested), `keys()`.
- Produces (`ctx.mjs`): `makeCtx({method, url, body, headers, env, params}) → context` for Pages handlers; `makeEnv(overrides)` with a `FakeR2` at `FILES`, test secrets, and `ASSETS.fetch` serving `public/` from disk.

- [ ] **Step 1: Failing tests:** `randomId()` length 20 and `/^[a-z0-9]+$/`, 1000 ids unique; `safeEqual('a','a')` true, `('a','b')` and `('a','ab')` false; `moveOrder` leaves exactly one key; `listAll` returns 5 of 5 objects with page size 2; `requireWorker` 401 for missing or wrong bearer, `null` for right.
- [ ] **Step 2: Run** `node --test tools/tests/shop-lib.test.mjs` → FAIL.
- [ ] **Step 3: Implement** (rejection sampling in `randomId` so letters are uniform).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shop): shared helpers for the order queue`.

### Task 5: Order and waitlist endpoints

**Files:**
- Create: `functions/_shared/order-check.js`, `functions/api/report/order.js`, `functions/api/report/waitlist.js`
- Modify: `wrangler.toml` (`GUMROAD_PRODUCT_URL = ""`, `GUMROAD_PRODUCT_ID = ""` under `[vars]`, comment "owner fills")
- Test: `tools/tests/shop-order.test.mjs`

**Interfaces:**
- Consumes: Task 4 helpers; `findPlace` (Task 1) with `fetch` = `(u) => env.ASSETS.fetch(new URL(u, request.url))`; `checkDate`, `checkTime` (`public/tools/js/input.js`); `localToUtc` (`time.js`).
- Produces: `checkOrder(body, { findPlace, now }) → Promise<{ok:true, order} | {ok:false, field, error}>`. Body: `{ name, email, date, time, fold, place:{name, country, lat, lon}, timeSource, sure, riskAccepted, consentPrivacy, consentWaiver, turnstile }`.
- Produces: `POST /api/report/order` → `200 { pay: '<GUMROAD_PRODUCT_URL>?order=<id>&email=<urlencoded email>' }` or `400 { field, error }`; `403` on a bad Turnstile token. `POST /api/report/waitlist` `{ email, consent: true, turnstile }` → `200 {ok:true}`, saves `waitlist/<rand>.json`.

Rules for `checkOrder` (error texts in plain English, shown under the field):
- `name`: trimmed, 1–60 characters, no control characters.
- `email`: at most 254 characters, one `@`, a dot after it.
- `date`: `checkDate` ok and not after `now`. `time`: `checkTime` ok.
- `place`: `findPlace` must return a row; `tz` comes from that row, never from the client; `|lat| ≤ 66` ("We can't make this report for places this far north or south yet.").
- `localToUtc`: `missing` → error on `time`; `ambiguous` → `fold` must be 0 or 1; `ok` → `fold` saved as `null`.
- `timeSource` and `sure` in their lists; `riskAccepted` boolean; both consents `=== true`.

- [ ] **Step 1: Failing tests:** valid demo order → 200, one key under `orders/pending/`, record has `tz: 'Europe/Warsaw'` even when the client sent another tz, `pay` URL has `order=<20 chars>`; one test per rule above (each returns 400 with the right `field`); polar town fixture (lat 69.65) → 400 `place`; Turnstile false → 403 and nothing saved; waitlist without consent → 400.
- [ ] **Step 2: Run** `node --test tools/tests/shop-order.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Turnstile goes through `outFetch(env)`, times through `nowMs(env)` (Task 4).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shop): order and waitlist endpoints`.

### Task 6: Gumroad ping

**Files:**
- Create: `functions/api/report/gumroad-ping.js`
- Test: `tools/tests/shop-ping.test.mjs`

**Interfaces:**
- Consumes: Task 4 helpers (the Gumroad API call goes through `outFetch(env)`).
- Produces: `POST /api/report/gumroad-ping?key=<PING_SECRET>`, form-encoded body. Reads `sale_id`, `url_params[order]`, `test`, `product_id`. Verifies with `GET https://api.gumroad.com/v2/sales/<sale_id>?access_token=<GUMROAD_ACCESS_TOKEN>` → `{ success, sale: { id, product_id, email, refunded, disputed, price } }`.

Behaviour (first match wins):
1. Wrong or missing `key` → 403, nothing changes.
2. `sales/<sale_id>.json` exists and the sale is not refunded/disputed → 200, nothing changes (retry).
3. Gumroad API error or `success: false` → set `pingFailedAt` on the pending order (if found), alert "Gumroad check failed for sale <sale_id>", answer 502 (Gumroad retries).
4. `sale.product_id !== GUMROAD_PRODUCT_ID` → alert, 200.
5. Sale refunded or disputed → alert "Sale <sale_id> refunded/disputed, order <id>", 200, delete nothing.
6. No pending order for `url_params[order]` → `orders/orphan/<sale_id>.json` `{ sale_id, email: sale.email, at }`, alert, 200.
7. Else → move to paid with `sale_id`, `paidAt`, `test: test === 'true'`, `beta: sale.price === 0`, `emailMismatch` (case-insensitive compare; on mismatch also alert); write `sales/<sale_id>.json`; 200.

- [ ] **Step 0: Confirm field names** against https://gumroad.com/ping and the Gumroad API sales docs (WebFetch). If `refunded`/`disputed`/`price` have other names, use the real ones and note it in the commit message.
- [ ] **Step 1: Failing tests,** one per behaviour 1–7, plus: the same valid ping twice → one paid order, one `sales/` key; behaviour 3 then cleanup at +25 h keeps the order (asserted in Task 7, so here only assert `pingFailedAt` is set).
- [ ] **Step 2: Run** `node --test tools/tests/shop-ping.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shop): Gumroad ping with sale check`.

### Task 7: Queue API and download link

**Files:**
- Create: `functions/api/report/next.js`, `functions/api/report/file/[id].js`, `functions/api/report/status/[id].js`, `functions/api/report/retry/[id].js`, `functions/api/report/delivered.js`, `functions/api/report/feedback-due.js`, `functions/api/report/inbox.js`, `functions/api/report/cleanup.js`, `functions/r/[token].js`
- Modify: `public/_headers` (add `/r/*` and `/report/*` → `X-Robots-Tag: noindex`)
- Test: `tools/tests/shop-queue.test.mjs`

**Interfaces (all except `/r/` need the worker bearer; `now` = `nowMs(env)` so tests can move time):**
- `POST /api/report/next` → first moves every `working` order whose `leaseUntil < now` back to `paid` (`leases + 1`); if `leases ≥ MAX_LEASES` it goes to `failed` with reason `lease expired 3 times` and an alert instead. Then returns the paid order with the oldest `paidAt`, moved to `working` with `leaseUntil = now + LEASE` → `200 {order}`; empty → `204`.
- `PUT /api/report/file/:id` (body = PDF bytes, order must be `working`) → stores `reports/<id>.pdf`, new token, `tokens/<token>.json { id, name, expiresAt: now + KEEP }`, saves `token` on the order → `200 { url: 'https://cosmicuniversum.com/r/<token>' }` (origin from the request URL).
- `POST /api/report/status/:id` body `{ status?: 'delivered'|'failed', reason?, delayMailSent?, feedbackSent? }`. `delivered` (from working): delete `birth`, set `deliveredAt`. `failed` (from working): `failReason` cut to 200 chars. Flags only: update the record where it is. Unknown id → 404.
- `POST /api/report/retry/:id` (from failed) → paid, `leases = 0`, `failReason` removed.
- `GET /api/report/delivered?email=` → `[{ id, name, url }]`, delivered within 30 days, email compared case-insensitively.
- `GET /api/report/feedback-due` → `[{ id, email, name }]`: delivered, `beta`, `deliveredAt ≤ now − 3 days`, no `feedbackSent`.
- `POST /api/report/inbox` → `{ alerts: [{text, at}], waitlist: [{email}] }` and deletes what it returns.
- `POST /api/report/cleanup` → deletes pending orders older than `PENDING_TTL` unless `pingFailedAt`; delivered orders, their PDF and token after `KEEP` from `deliveredAt`; expired tokens → `{ pending, delivered, tokens }` counts.
- `GET /r/:token` → PDF with `SECURITY_HEADERS`, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<Safe>_birth-chart.pdf"; filename*=UTF-8''<encoded name>_birth-chart.pdf`. `<Safe>` = name folded to ASCII, other characters → `-`, empty → `Your`. Unknown or expired token → 404.

- [ ] **Step 1: Failing tests:** every endpoint 401 without the bearer; `next` returns oldest `paidAt` first and `204` when empty; lease expiry returns the order; third expiry → failed + alert (Review Focus 5); upload → download returns the same bytes with the right filename; name `Zoë O'Brien/x` → `filename="Zoe-O-Brien-x_birth-chart.pdf"`; delivered record has no `birth` key; cleanup at +25 h deletes a plain pending order but keeps one with `pingFailedAt` (Review Focus 1); cleanup at +31 days deletes record, PDF and token, and `/r/<token>` gives 404; `inbox` returns then empties; `delivered?email=` finds `ALEX@example.com` for `alex@example.com`; `retry` moves failed → paid.
- [ ] **Step 2: Run** `node --test tools/tests/shop-queue.test.mjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Then run every shop and report node test file one by one → all pass.
- [ ] **Step 5: Commit** — `feat(shop): queue API for the VPS worker and the download link`.

### Task 8: Order form page and legal drafts

**Files:**
- Create: `public/report/index.html`, `public/report/report.css`, `public/report/js/order-form.js`, `public/report/js/order-page.js`, `public/report/privacy/index.html`, `public/report/terms/index.html`
- Test: `tools/tests/report-order-form.test.mjs`

**Interfaces:**
- Consumes: `searchPlaces` (Task 1); `timeWindow`, `fitsWindow`, `clockText` (Task 2); `loadEphemeris`, `localToUtc`, `checkDate`, `checkTime`; `POST /api/report/order`, `POST /api/report/waitlist` (Task 5); the site styles `/assets/style.css` and the chart page layout as the model.
- Produces (`order-form.js`, pure, no DOM): `checkFields(f) → {field, error}[]`; `timeMessage(w, utc, sure, tz, date) → { safe: boolean, text: string }` with the spec's exact texts: safe → `Your Rising sign stays <sign> from <a> to <b>. Your time is safe.`; not safe → names the part that changes and the time it changes, then asks the customer to check the time; `buildPayload(f, turnstileToken) → body for /api/report/order`.

Page rules from the spec: the fields in spec section 1 in that order; 24 h time input; two ticks not pre-ticked with the spec's exact consent texts; no time → stop text plus waitlist box; unsafe time → extra tick "I understand that my Rising sign, houses or Moon sign may be different." needed before Pay; clock-change night → ask "earlier or later" (`fold`); "Is this right?" summary (name, date, time, town, country, time zone) before Pay; Turnstile widget with `TURNSTILE_SITEKEY`; GeoNames credit line ("Town data: GeoNames, CC BY 4.0") with a link; links to the two legal pages. `<meta name="robots" content="noindex">` until launch.

Legal pages: plain-word drafts of spec section 7, marked at the top "DRAFT, waiting for owner approval. Not legal advice." The privacy page says the AI gets "chart positions, no name, no email, no place".

- [ ] **Step 1: Failing tests** for `checkFields` (missing time → `time` error with the "needs a birth time" text), `timeMessage` (safe text exact; unsafe text contains the changing part's name), `buildPayload` (no extra keys; `fold` null unless set).
- [ ] **Step 2: Run** `node --test tools/tests/report-order-form.test.mjs` → FAIL.
- [ ] **Step 3: Implement** the pure module, then the page and the DOM glue.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Check in a browser.** Run `npx wrangler pages dev public` and open `http://localhost:8788/report/`. With the demo person: town search finds "Kraków"; the time message shows; with sure = 60 near a change the extra tick appears; "Pay" posts and redirects to the Gumroad URL (empty URL locally is fine; check the `order=` part in the network log). Turnstile local test keys: sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` via `.dev.vars` (git-ignored; check `.gitignore` and add `.dev.vars` if missing).
- [ ] **Step 6: Commit** — `feat(shop): order form and legal drafts`.

### Task 9: validate.py returns structured errors

**Files:**
- Modify: `tools/report/validate.py`
- Test: `tools/report/test_validate.py` (add tests)

**Interfaces:**
- Produces: `check(facts: dict, content: dict) -> Result` with `@dataclass Result: errors: list[str]; warns: list[str]; grade: float; sentences: int`. Each per-sentence error keeps its `"<section id>#<n>: "` prefix. `main()` loads files, calls `check`, prints exactly what it prints today.

- [ ] **Step 1: Failing test:** `check(demo_facts(), minimal_content(...))` returns `errors == []`; a content with a wrong sign in `planet.Mars` returns an error starting with `planet.Mars#1:`.
- [ ] **Step 2: Run** `py -m pytest tools/report/test_validate.py -q` → FAIL.
- [ ] **Step 3: Implement** (move the body of `main` into `check`).
- [ ] **Step 4: Run** `py -m pytest tools/report -q` → all pass.
- [ ] **Step 5: Commit** — `refactor(report): validate.check returns errors for the shop worker`.

### Task 10: Worker building blocks (config, queue client, AI input filter, Sender)

**Files:**
- Create: `tools/shop/config.py`, `tools/shop/api.py`, `tools/shop/ai_input.py`, `tools/shop/sender.py`, `tools/shop/requirements.txt`, `tools/shop/conftest.py`
- Test: `tools/shop/test_ai_input.py`, `tools/shop/test_api.py`, `tools/shop/test_sender.py`

**Interfaces:**
- `config.load(env: Mapping[str, str] = os.environ) -> Config` (frozen dataclass, one field per VPS env name in Global Constraints; raises `ValueError` naming the missing variable, never its value).
- `api.Queue(base_url: str, secret: str, http: requests.Session)` with `next() -> dict | None`, `upload(id: str, pdf: bytes) -> str`, `status(id: str, status: str | None = None, reason: str | None = None, **flags) -> None`, `retry(id) -> None`, `delivered(email: str) -> list[dict]`, `feedback_due() -> list[dict]`, `inbox() -> dict`, `cleanup() -> dict`. Non-2xx → `QueueError(endpoint, status_code)`.
- `ai_input.redact(facts: dict) -> dict` — deep copy without the keys listed in Global Constraints; `saturnReturns` → `[{n, status}]`.
- `sender.Sender(token: str, http)` with `send(template_id: str, to: str, variables: dict, attach_url: str | None = None) -> None` and `add_to_group(email: str, group_id: str) -> None`. Error → `SenderError(status_code)` (no email in the message).
- `requirements.txt`: `anthropic`, `requests`, `reportlab`, `pypdf`, `pytest` (pin to the versions installed on this PC; check `py -m pip show`).
- `conftest.py` puts `tools/report` and `tools/shop` on `sys.path`.

- [ ] **Step 0: Confirm the Sender.net API** (WebFetch the Sender transactional API and subscriber group docs): endpoint, auth header, how a template is chosen, attachment field. Write the endpoint URLs as module constants with a comment linking the doc page.
- [ ] **Step 1: Failing tests:** `redact(demo_facts())` → none of the banned keys anywhere (walk the whole tree; also assert the strings `'Alex'`, `'Kraków'`, `'1990-03-14'`, `'08:30'` do not appear in `json.dumps(result)`); `saturnReturns` items have exactly keys `{'n','status'}`; the original dict is unchanged. `Queue` with a fake session: sends the bearer header, `next()` → `None` on 204, `QueueError` on 500. `Sender` with a fake session: right URL, header and body shape; `SenderError` message has no `@`. `config.load({})` raises naming `ANTHROPIC_API_KEY`.
- [ ] **Step 2: Run** `py -m pytest tools/shop -q` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shop): worker config, queue client, AI input filter, Sender client`.

### Task 11: AI pipeline

**Files:**
- Create: `tools/shop/pipeline.py`
- Test: `tools/shop/test_pipeline.py`

**Interfaces:**
- `Usage(model: str, input_tokens: int, output_tokens: int)`.
- `class ModelClient(Protocol): def complete(self, model: str, system: str, user: str) -> tuple[str, Usage]`.
- `AnthropicClient(api_key)` — uses `anthropic.Anthropic().messages.stream(..., max_tokens=32000)` and `get_final_message()` (long outputs need streaming).
- `load_prompts(path=tools/report/PROMPT.md) -> dict` with keys `writer`, `checker`, `humanizer` (the ```text blocks under "## Prompt 1/2/3") and `ticket` (the "## Job ticket" section text).
- `parse_json_reply(text: str) -> dict` (accepts a ```json fence or bare JSON; `PipelineError` if none).
- `parse_checker(text: str) -> tuple[int, list[str]]` (`TOTAL FAIL = n`, the FAIL lines; missing total → `PipelineError`).
- `run_ai(facts: dict, library: dict, client: ModelClient, models: dict, check=validate.check) -> tuple[dict, list[Usage]]`. Raises `PipelineError(reason)`; `reason` never holds sentence text.

Algorithm (the part the signature does not fix):
1. AI input = `ai_input.redact(facts)`. Validation always uses the full `facts`.
2. Round 1: writer gets system = writer prompt, user = ticket + `FACTS` + `LIBRARY` JSON. Rounds 2–3: writer gets its last content plus the validator errors or the checker FAIL lines, and is told to return the whole fixed JSON.
3. After each writer reply: `check()`. Errors → next round (skip the checker). Clean → checker (system = checker prompt, user = FACTS, LIBRARY, CONTENT). `TOTAL FAIL = 0` → done; else next round with the FAIL lines.
4. Not clean after round 3 → `PipelineError('writer: not clean after 3 rounds (<n> errors, <m> checker fails)')`.
5. Humanizer on the clean content. `check()` the result. For each section with a `"<id>#"` error, put back the whole pre-humanizer section (the humanizer may join or split sentences, so a sentence index is not stable). If report-wide errors stay (grade, repeats), use the whole pre-humanizer content. `check()` must then be clean, else `PipelineError`.

- [ ] **Step 1: Failing tests** with `FakeClient(replies: list[str])` that records every `(model, system, user)` call: happy path (writer clean, checker 0, humanizer clean) → 3 calls with the 3 configured models; validator error in round 1 → writer called twice, checker once; checker fails 3 times → `PipelineError` mentioning "3 rounds"; humanizer breaks one section → that section equals the pre-humanizer one, others take the humanized text; no user prompt sent to the client contains `'Alex'`, `'Kraków'`, `'1990-03-14'` or `'08:30'`; `parse_checker` on a reply without a total raises. Content for the fake replies: `testkit.minimal_content(demo_facts())`.
- [ ] **Step 2: Run** `py -m pytest tools/shop/test_pipeline.py -q` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shop): AI writer, checker and humanizer loop with validator gates`.

### Task 12: worker.py, systemd, setup and owner docs

**Files:**
- Create: `tools/shop/worker.py`, `tools/shop/prices.json`, `tools/shop/systemd/cosmic-report.service`, `cosmic-report.timer`, `cosmic-report-daily.service`, `cosmic-report-daily.timer`, `docs/SHOP-VPS-SETUP.md`, `docs/shop/OWNER-CHECKLIST.md`, `docs/shop/EMAILS.md`
- Test: `tools/shop/test_worker.py`

**Interfaces:**
- CLI: `python tools/shop/worker.py once | daily | retry <id> | resend <email>`.
- `process(order: dict, deps: Deps) -> None` where `Deps(queue: Queue, sender: Sender, client: ModelClient, cfg: Config, run_node: Callable, log: Callable)`. Steps: temp dir (`tempfile.TemporaryDirectory(prefix='cosmic-report-')`, always removed) → `input.json` = `{ name, date, time, place, lat, lon, tz, fold, sure }` from the order → `facts.mjs` (adds `timeCheck`, the VPS re-run of the time check) → `run_ai` → `build_report.build` → `queue.upload` → `sender.send(SENDER_TPL_READY, email, {name, url}, attach_url=url)` → `queue.status(id, 'delivered')`.
- On any exception: `queue.status(id, 'failed', reason=<short class + step, no data>)`; alert to `OWNER_ALERT_EMAIL` via `SENDER_TPL_ALERT` ("Order <id> needs a look: <reason>"); if not `delayMailSent`, send `SENDER_TPL_DELAY` to the customer and set the flag.
- `once`: lock file `/tmp/cosmic-report.lock` (`fcntl.flock`, non-blocking; another run holds it → exit 0); remove old temp dirs with prefix `cosmic-report-` older than 1 hour; `inbox()` → alerts emailed to the owner, waitlist emails added to `SENDER_WAITLIST_GROUP`; then `next()` → `process()`.
- `daily`: `cleanup()` and log the counts; if `FEEDBACK_FORM_URL` is set, for each `feedback_due()` send `SENDER_TPL_FEEDBACK` and set `feedbackSent`.
- `resend <email>`: `delivered(email)` → send READY again with the same URL; none → print "no delivered order in the last 30 days".
- Log line per step: `order=<id> step=<name> status=<ok|fail> secs=<n> in=<tokens> out=<tokens> cost=<usd|na>`, cost from `prices.json` (`{ "<model>": [usd_per_mtok_in, usd_per_mtok_out] }`, filled from https://docs.anthropic.com pricing at build time; a missing model → `na`).

- [ ] **Step 1: Failing tests** with fakes for every dependency and a fake `run_node` that copies `samples/demo-facts.json`: happy path → upload, READY email to the order email, status delivered, temp dir gone; pipeline error → failed + owner alert + one DELAY email, and a second failure of the same order sends no second DELAY email; captured log lines contain no `'Alex'`, `'@'`, `'Kraków'`, `'1990'`; `once` with the lock held → returns without calling `next()`; `daily` without `FEEDBACK_FORM_URL` sends nothing.
- [ ] **Step 2: Run** `py -m pytest tools/shop/test_worker.py -q` → FAIL.
- [ ] **Step 3: Implement** worker and units. Service runs as a dedicated user `cosmic`, `EnvironmentFile=/etc/cosmic-report/env`, `WorkingDirectory=/opt/cosmic/repo`. Timer: `OnCalendar=*:0/1`; daily timer `OnCalendar=03:30`.
- [ ] **Step 4: Run** `py -m pytest tools/shop -q` → all pass.
- [ ] **Step 5: Write the docs.** `SHOP-VPS-SETUP.md`: every command (create user, clone, install Node 20+ and Python 3.12+, venv, `pip install -r tools/shop/requirements.txt`, create the env file with `install -m 600`, enable timers, check with `systemctl list-timers` and `journalctl -u cosmic-report`, update with `git pull`). `OWNER-CHECKLIST.md`: spec "Owner to-do" items 1–6 as tick boxes, plus `wrangler pages secret put <NAME>` lines for the 4 Cloudflare secrets (the owner runs them with `!`), plus the Gumroad test purchase steps. `EMAILS.md`: the 4 email texts (ready, being finished by hand, owner alert, beta feedback) in the report's plain-English rules, marked "waiting for owner approval".
- [ ] **Step 6: Commit** — `feat(shop): VPS worker, timers and setup guide`.

### Task 13: Full check and handoff

- [ ] **Step 1: Run every test.** `py -m pytest tools/report tools/shop -q` and each node file one by one: `for f in tools/tests/*.test.mjs; do node --test "$f" || echo "FAIL $f"; done` → no `FAIL` line.
- [ ] **Step 2: Local run of the queue.** `npx wrangler pages dev public` with `.dev.vars` test secrets. Post the demo order to `/api/report/order` → 200. Copy it to paid with `npx wrangler r2 object get/put --local` (`orders/pending/<id>.json` → `orders/paid/<id>.json` with `"status":"paid"`). `curl -X POST -H "Authorization: Bearer <test secret>" http://localhost:8788/api/report/next` → the order. Do NOT run the AI steps here: that needs the owner's API key on this PC and costs money. The full run with AI is the spec's Gumroad test purchase on the VPS (owner checklist).
- [ ] **Step 3: Update** `docs/HANDOFF-chart-report.md` "State now" and "NEXT" (built, not deployed; owner checklist path; the Gumroad test purchase is the next step).
- [ ] **Step 4: Commit** — `docs(shop): handoff after the build`.
- [ ] **Step 5: Final review.** One fresh reviewer (most capable model) reads the spec, this plan and `git diff master...HEAD`, with the Review Focus list. Fix what it finds, re-run Step 1.
- [ ] **Step 6: Before any push:** scan `git diff origin/feat/chart-tools` for real birth data (owner's date, time, town). Ask the owner before `git push`.
