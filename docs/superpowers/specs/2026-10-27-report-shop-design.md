# Chart report shop: order form, Gumroad payment, automatic delivery

Date: 2026-10-27. The owner approved the scope in chat ("go with 1": build the shop pipeline first, then run the beta through it).
Builds on the V3 report (`docs/HANDOFF-chart-report.md`, `tools/report/`).

## Why

- The report is finished, but it can't be sold yet. Today a human makes each report by hand in a Claude Code session.
- The owner wants a fully automatic pipeline. AI does the writing steps. Code does everything else.
- Before launch, about 50 email subscribers get a free report through this same shop, using a 100% discount code. Their feedback and quotes go on the sales page.
- The owner does not want refunds. Fast delivery and checks before payment remove the main reasons for refunds.

## Goals

1. An order form on cosmicuniversum.com takes the birth data. It checks the data and runs a birth-time safety check before payment.
2. Payment runs on Gumroad. The order number travels in the Gumroad link.
3. The report is made and emailed automatically, usually within minutes. The product page promises "within 24 hours".
4. The AI steps run on the Anthropic API with the owner's key, on the owner's VPS.
5. Data is deleted on a fixed schedule: unpaid orders after 24 hours; birth data right after delivery; the PDF and a small order record after 30 days.
6. When an order fails, the owner gets an alert, and the customer gets a calm "your report is on its way" email.
7. The 50 beta testers use the same flow with a 100% Gumroad discount code.

## Non-goals

- No version without a birth time. The form explains this and offers a waitlist. A no-time pipeline is a later project, only if many people ask for it.
- No shop page builder, no cart, no subscriptions, no upsells.
- No customer accounts or logins.
- No webhook straight to the VPS (see "Decided").
- No DeepSeek or other non-Anthropic model for customer orders.

## Anti-goals (a failure even if it works)

- Real birth data in git, in logs, in the public repo, or in an AI prompt with the name, email or birth place.
- A report sent with facts that fail `validate.py`.
- A paid order that silently never gets a report. Every paid order ends as "delivered" or as an owner alert.
- A form that lets the customer pay with data the system can't use (unknown town, no time, impossible date).
- Text that promises results, predicts events or sounds like ritual magic.

## Decided (owner)

| Topic | Decision |
|---|---|
| Customer data entry | Own form on the site first, then Gumroad. Not Gumroad fields only. |
| Payment | Gumroad. Store refund setting "No refunds allowed" (owner sets it). |
| AI | Anthropic API, owner's key, stored only on the VPS. |
| Runs on | Owner's Ubuntu VPS (45 PLN a month, Claude Code installed for maintenance). |
| VPS gets orders | The VPS asks Cloudflare for paid orders every minute. Gumroad's ping goes to Cloudflare. Nothing calls the VPS from outside. |
| Email | Sender.net transactional email. |
| Keep | Delivered PDFs are kept 30 days for resends, then deleted. |
| Birth time | Launch only for customers who know their birth time, at least roughly. A safety check runs on every order. |
| Beta | 50 subscribers, 100% discount code, same flow. Send to 5 people first, then to the other 45. |

## The flow

```
customer ─► order form (site, Turnstile) ─► Cloudflare: save PENDING order (R2) ─► "Pay" ─► Gumroad checkout (?order=<id>)
Gumroad ─► ping ─► Cloudflare: verify sale with Gumroad API ─► order PAID
VPS (every minute) ─► Cloudflare: take next PAID order (lease) ─► pipeline ─► upload PDF ─► Sender.net email ─► DELIVERED
VPS (daily) ─► Cloudflare: clean up (24 h / 30 days rules)
```

### 1. Order form (Cloudflare Pages, `public/report/` + `functions/api/report/`)

Fields:
- Name as it should print.
- Email.
- Birth date.
- Birth time (24 h picker).
- Where the time comes from: birth certificate or hospital record / a parent / my own guess.
- How sure the customer is: exact / within 15 minutes / within 30 minutes / within 1 hour.
- Birth town: search with suggestions.

Two ticks (not pre-ticked):
- Privacy: "I agree that cosmic_universum uses my birth data only to make my report. An AI service (Anthropic) helps write it. My data is deleted as described in the privacy note."
- Right to cancel: "I want my report now. I understand that I lose my right to cancel once it is delivered."

If there is no birth time: the form says the report needs one and stops. It offers "Tell me when a version without a birth time exists": email plus consent tick, added to a Sender.net list "no-time waitlist".

**Town search:**
- Use GeoNames places with population 500+ (`cities500`, CC BY 4.0), so small towns are found. The current list (`public/tools/data/cities.json`) has only towns of 15,000+ people.
- The search runs on our own site (a Cloudflare Function, plus data in R2 or split static files). Customer input is never sent to an outside geocoding service.
- Each town carries its lat, lon and time zone.
- Credit GeoNames on the form page.

**Birth-time safety check (in the browser, with the site's own chart engine in `public/tools/js`):**
- Compute the chart at the given time. Then find the earliest and latest local times, inside ±3 hours, where the Rising sign, the Moon sign and the Midheaven sign stay the same. Use 1-minute steps, or a search with the same result.
- If the customer's "how sure" range fits inside that window: show "Your Rising sign stays <sign> from <a> to <b>. Your time is safe."
- If not: show which part can change and at what time. Ask the customer to check their time. They may still order after ticking "I understand that my Rising sign, houses or Moon sign may be different." The tick is saved with the order.
- The check runs again on the VPS. The report prints one line in "Your birth data": "Time check: your Rising sign stays <sign> from <a> to <b>."

**Before payment:**
- An "Is this right?" summary: name, date, time, town, country, time zone.
- If the local time does not exist or happens twice (clock change night), the form asks the customer which one, the same as `facts.mjs`.

On "Pay":
- `POST /api/report/order` validates everything again on the server. It needs a valid Turnstile token.
- It saves `orders/pending/<id>.json` in R2. `<id>` is 20 random characters, unguessable.
- It redirects to the Gumroad product URL with `?order=<id>&email=<email>` (email prefill, if Gumroad supports it).

### 2. Gumroad (owner sets up, builder writes the checklist)

- One product, "Your Birth Chart Report". Copy says reflection, never prediction (Gumroad rule).
- Store setting: "No refunds allowed".
- Ping URL: `https://cosmicuniversum.com/api/report/gumroad-ping?key=<PING_SECRET>`.
- A Gumroad API access token (scope `view_sales`) is stored as a Cloudflare secret.
- Beta discount code: 100%, 50 uses, ends after the beta.

### 3. Gumroad ping (`POST /api/report/gumroad-ping`)

- Reject the ping if `key` is wrong.
- Read `sale_id`, `url_params[order]`, `test`, `product_id`. Gumroad sends nested fields as `url_params[order]`. The builder confirms the exact shape with a real test ping.
- Gumroad's ping is not signed. So **verify the sale** with `GET https://api.gumroad.com/v2/sales/<sale_id>` and the access token. Check the product, that it is not refunded or disputed, and the email.
- Move `orders/pending/<id>.json` to `orders/paid/<id>.json`. Add `sale_id`, `paidAt`, and `test: true/false`.
- Idempotent: Gumroad retries once an hour for up to 3 hours. A second ping for the same sale changes nothing.
- An unknown order id with a real sale: save it as `orders/orphan/<sale_id>.json` and alert the owner (the customer paid, but the form data is missing).
- A ping for a refunded or disputed sale: alert the owner. Do not delete anything automatically.
- Answer 200 fast.

### 4. Queue API for the VPS (Cloudflare Functions, `Authorization: Bearer <WORKER_SECRET>`)

- `POST /api/report/next`: return the oldest PAID order and mark it WORKING with a 30-minute lease. It returns nothing if the queue is empty. An expired lease returns the order to the queue.
- `PUT /api/report/file/<id>`: upload the PDF to R2 `reports/<id>.pdf`. Return a download link `https://cosmicuniversum.com/r/<token>`. The token is random, works for 30 days, and gives a no-index, no-cache download with the name `<Name>_birth-chart.pdf`.
- `POST /api/report/status/<id>`: set DELIVERED or FAILED (with a short reason, no birth data). On DELIVERED, the birth data is removed from the R2 order record. Kept: id, email, name, sale_id, status, dates, PDF token.
- `POST /api/report/cleanup`: delete PENDING orders older than 24 hours. Delete PDFs, tokens and order records 30 days after delivery. Return counts only.

### 5. VPS worker (`tools/shop/`, Python 3.12+, Node 20+)

- systemd timer every minute → `worker.py once`. One order at a time. A lock file stops overlapping runs.
- Steps per order, in a temporary folder that is always deleted at the end (also on errors):
  1. Write `input.json` → `node tools/report/facts.mjs`. Stop on "local time is ambiguous/missing" (the form should prevent this) → FAILED + alert.
  2. Re-run the time safety check. Add the time window to the facts (`timeCheck`).
  3. **AI writer → `validate.py` → AI checker → writer fixes → AI humanizer → `validate.py`**, as in `tools/report/PROMPT.md`. At most 3 writer rounds. A sentence that fails after the humanizer uses its text from before the humanizer.
  4. `build_report.py` → PDF.
  5. Upload → link → Sender.net transactional email with the PDF attached (Sender fetches attachments from an HTTPS link) and the link in the body.
  6. Status DELIVERED.
- On any failure after 3 rounds:
  - FAILED + owner alert email ("Order <id> needs a look: <reason>").
  - One customer email: "Your report is being finished by hand and will reach you within 24 hours."
  - The order stays in R2 until the owner retries it (`worker.py retry <id>`) or delivers by hand.
- **What the AI gets:** FACTS without `input`, without `items.name`, `items.birthPlace`, `items.birthDate`, `items.birthTime`, without the dates in `saturnReturns` (status and number only), and without `lons`. Plus the library and the prompt. The code puts the name back in the PDF. Note: planet positions alone can in theory point to a birth date. So the privacy note says the AI gets "chart positions, no name, no email, no place", not "nothing personal".
- Models (env, so the owner can change them): writer `claude-sonnet-5-5`, checker `claude-opus-5-5` (a different model from the writer, as `PROMPT.md` asks), humanizer `claude-sonnet-5-5`. Log tokens and cost per order (no text) so the owner sees the real cost.
- Secrets in `/etc/cosmic-report/env` (owner-only, mode 600): `ANTHROPIC_API_KEY`, `WORKER_SECRET`, `SENDER_API_TOKEN`, `OWNER_ALERT_EMAIL`. Never in git, never in logs.
- Logs: order id, step, status, time, cost. Never birth data, names or emails.
- `worker.py resend <email>`: find the delivered order within 30 days, send the same link again.
- Daily systemd timer → cleanup endpoint. The worker also deletes any leftover temporary folders.
- Deploy on the VPS: `git pull` of the public repo plus `pip install -r tools/shop/requirements.txt`. A setup guide (`docs/SHOP-VPS-SETUP.md`) gives the owner every command.

### 6. Emails (Sender.net transactional templates, owner approves the text)

- **Report ready:** PDF attached, download link, "kept for 30 days", a short line on how to read it.
- **Being finished by hand** (on failure).
- **Owner alert.**
- **Beta only, 3 days after delivery:** "Tell me what you think" with a link to a short feedback form (4–5 questions: what felt "so me", what was unclear, what was missing, what would you pay, can I quote you). The owner picks the form tool.

### 7. Legal texts (builder drafts in plain words, owner approves, not legal advice)

- **Privacy note.** What is collected, why, who helps (Cloudflare, Gumroad, Anthropic, Sender.net, the VPS host), how long it is kept (24 hours / delivery / 30 days), and the customer's rights, with a contact email.
- **Terms:** a reflection product, not advice; delivery time; the right-to-cancel waiver; no refunds, except when the report never arrives.
- **GeoNames credit.**

## Data and how long it lives

| Data | Where | Deleted |
|---|---|---|
| Unpaid order (birth data, email) | R2 `orders/pending/` | 24 h |
| Paid order birth data | R2 `orders/paid/`, VPS temp folder | Right after delivery (VPS temp: end of each run) |
| Small order record (id, name, email, sale id, status, dates) | R2 | 30 days after delivery |
| PDF (holds the birth data inside) | R2 `reports/` | 30 days after delivery |
| AI prompts | Anthropic API (positions only, no identifiers) | Anthropic's API retention |
| Payment record | Gumroad | Gumroad's rules |
| Waitlist email | Sender.net list | When the customer unsubscribes |

## Testing

- Unit tests with demo data only (repo is public): order validation, Turnstile check stub, ping handling (valid, wrong key, retry, unknown order, refunded sale), lease and expiry, cleanup rules, the worker's AI-input filter (no name/date/place/email reaches the prompt), the time safety window (a demo chart near a Rising-sign change and one far from it), AI steps with a fake model client.
- One end-to-end run with Gumroad's test purchase (`test: true`) and the owner's own email, before the beta.
- Beta order: 5 testers, fix, then 45.

## Owner to-do (outside code)

1. Gumroad: create the product, set "No refunds allowed", add the ping URL, make an API token, make the beta code.
2. Anthropic: find or create the API key and put it on the VPS (command in the setup guide). Never paste it into chat or git.
3. Sender.net: check that the plan includes transactional email, verify the sending domain, and approve the 4 email texts.
4. Cloudflare: add the secrets (`GUMROAD_ACCESS_TOKEN`, `PING_SECRET`, `WORKER_SECRET`, Turnstile secret) — deploy commands are run by the owner with the `!` prefix.
5. Approve the privacy note, the terms and the form copy.
6. Pick the price and the feedback form tool.

## Left to the builder

- File layout under `public/report/`, `functions/api/report/`, `tools/shop/`.
- How the town data is split and searched, within "own server, no outside calls".
- The exact time-window search, within the rule above.
- Form design, inside the site's existing style.
- Wording of fixed form and email texts, inside the report's plain-English rules, for owner approval.

## Sources

- Gumroad ping (retries hourly up to 3 hours; `sale_id`, `url_params`, `custom_fields`, `test`): https://gumroad.com/ping
- Gumroad resource subscriptions (refund, dispute events): https://www.mintlify.com/antiwork/gumroad/api/resource-subscriptions
- Sender.net transactional attachments (HTTPS link): https://www.sender.net/help/transactional-emails/attachments-and-size-limits/
- EU Directive 2011/83 Art. 16(m) (digital content waiver): https://www.legislation.gov.uk/eudr/2011/83/article/16/data.htm
- GeoNames dumps (CC BY 4.0): https://download.geonames.org/export/dump/
