# Report shop: email texts

Approved by the owner on 2026-10-28. Make each one as a Sender.net transactional template.
Put the template id in the VPS env file (name in brackets).
Words in `{{ }}` are variables the worker fills in. Check the variable syntax in Sender.net's template editor.

## 1. Report ready (`SENDER_TPL_READY`)

Variables: `name`, `url`. The PDF is attached.

**Subject:** Your birth chart report is here

Hi {{name}},

Your birth chart report is attached to this email.

You can also download it here: {{url}}

The link works for 30 days. After that, we delete your report and your order.

How to read it: start with "Start here". Then read your Sun, Moon and Rising sign. Take your time with the rest. Read a little, then notice how it fits your days.

Warm wishes,
cosmic_universum

## 2. Being finished by hand (`SENDER_TPL_DELAY`)

Variables: `name`.

**Subject:** Your birth chart report is on its way

Hi {{name}},

Thank you for your order. Your report needs a last check by hand, so it takes a little longer.

It will reach you within 24 hours. You do not need to do anything.

Warm wishes,
cosmic_universum

## 3. Owner alert (`SENDER_TPL_ALERT`)

Variables: `text`. Goes only to `OWNER_ALERT_EMAIL`.

**Subject:** Report shop: needs a look

{{text}}

What to do: look at the logs on the VPS (`journalctl -u cosmic-report -n 100`). After the fix, run `worker.py retry <order id>`. See docs/SHOP-VPS-SETUP.md.

## 4. Beta feedback, 3 days after delivery (`SENDER_TPL_FEEDBACK`)

Variables: `name`, `form`. Sent only to beta testers, and only when `FEEDBACK_FORM_URL` is set.

**Subject:** What did you think of your report?

Hi {{name}},

You got your birth chart report a few days ago. Thank you for testing it.

Could you answer 5 short questions? It takes about 3 minutes: {{form}}

1. What felt most "so me"?
2. What was unclear?
3. What was missing?
4. What would you pay for this report?
5. May I quote you on the sales page?

Your answers shape the report for everyone after you.

Warm wishes,
cosmic_universum
