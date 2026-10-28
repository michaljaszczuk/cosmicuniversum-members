# Report shop: owner checklist

Do these steps before the first real order. The code is ready; these steps need your accounts.
Never paste a key or token into chat or git.

## 1. Gumroad

- [ ] Create one product: "Your Birth Chart Report". The copy says reflection, never prediction.
- [ ] Settings: refund policy "No refunds allowed".
- [ ] Settings → Advanced → Ping: `https://cosmicuniversum.com/api/report/gumroad-ping?key=<PING_SECRET>` (make a long random PING_SECRET first, step 4).
- [ ] Make an API access token (Settings → Advanced → Applications) with the `view_sales` scope.
- [ ] Find the product id: open `https://api.gumroad.com/v2/products?access_token=<token>` in your browser and copy the `id` of the report product. Put it in `wrangler.toml` as `GUMROAD_PRODUCT_ID`. Put the product link in `GUMROAD_PRODUCT_URL`.
- [ ] Beta discount code: 100% off, 50 uses, ends after the beta.

## 2. Anthropic

- [ ] Find or make an API key at console.anthropic.com. Put it only in `/etc/cosmic-report/env` on the VPS (docs/SHOP-VPS-SETUP.md, step 3).

## 3. Sender.net

- [ ] Check that your plan includes transactional email.
- [ ] Verify the sending domain.
- [ ] Approve the 4 email texts in `docs/shop/EMAILS.md`, make them as transactional templates, and put the template ids in the VPS env file.
- [ ] Make a subscriber group "no-time waitlist" and put its id in the env file (`SENDER_WAITLIST_GROUP`).
- [ ] Make a subscriber group "far-north waitlist" and put its id in the env file (`SENDER_POLAR_GROUP`). People whose birth town is past 66° land here.
- [ ] Make a custom subscriber field "town" (text). Check that its tag is `{$town}`; the worker fills it.
- [ ] Make an API token (Settings → API access tokens) for the env file (`SENDER_API_TOKEN`).

## 4. Cloudflare secrets

Make 2 long random values first (for example with `openssl rand -hex 32`): one for `PING_SECRET`, one for `WORKER_SECRET`.
Run each line in Claude Code with the `!` prefix. Each asks for the value; paste it there, not in chat.

```
! npx wrangler pages secret put PING_SECRET --project-name cosmicuniversum
! npx wrangler pages secret put WORKER_SECRET --project-name cosmicuniversum
! npx wrangler pages secret put GUMROAD_ACCESS_TOKEN --project-name cosmicuniversum
! npx wrangler pages secret put TURNSTILE_SECRET --project-name cosmicuniversum
```

`TURNSTILE_SECRET` is the secret key of the Turnstile widget whose site key is in `wrangler.toml`.
Use the same `WORKER_SECRET` value in the VPS env file.

## 5. Texts to approve (approved 2026-10-28)

- [x] Order form copy: `public/report/index.html` and the messages in `public/report/js/order-form.js` and `functions/_shared/order-check.js`.
- [x] Privacy note: `public/report/privacy/index.html`. Still to do: add your contact email.
- [x] Terms: `public/report/terms/index.html`. Still to do: add your contact email.
- [x] The 4 emails: `docs/shop/EMAILS.md`.

## 6. Decide

- [ ] The price.
- [ ] The feedback form tool (for the beta email). Put its link in `FEEDBACK_FORM_URL`.

## 7. First test with Gumroad (no money)

1. Deploy the site. Set up the VPS (docs/SHOP-VPS-SETUP.md).
2. Open `https://cosmicuniversum.com/report/`, fill in the form with your own data and your own email, and pay. Buying your own product is a free test purchase (`test: true`).
3. Within a few minutes: the report email arrives. Check the PDF and the download link.
4. On the VPS: `journalctl -u cosmic-report -n 50` shows every step `ok` and the cost.
5. If something fails, you get an alert email. Then run `worker.py retry <order id>` after the fix.

## 8. Beta

- [ ] Send the 100% code to 5 subscribers first. Read their feedback. Fix. Then send it to the other 45.
