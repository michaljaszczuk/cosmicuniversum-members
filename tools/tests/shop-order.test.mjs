// POST /api/report/order and /api/report/waitlist (demo person only).
// Run: node --test tools/tests/shop-order.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestPost as postOrder } from '../../functions/api/report/order.js';
import { onRequestPost as postWaitlist } from '../../functions/api/report/waitlist.js';
import { searchPlaces } from '../../public/report/js/places.js';
import { makeCtx, makeEnv } from './shop/ctx.mjs';

const diskFetch = async (u) => {
  try { return { ok: true, status: 200, json: async () => JSON.parse(await readFile(`public${u}`, 'utf8')) }; }
  catch { return { ok: false, status: 404 }; }
};
const pick = async (q, cc) => (await searchPlaces(q, { fetch: diskFetch })).find((p) => p.country === cc);
const krakow = await pick('krakow', 'PL');
const tromso = await pick('tromso', 'NO');
const place = (p) => ({ name: p.name, country: p.country, lat: p.lat, lon: p.lon });

const turnstileOk = async (url) => {
  assert.match(String(url), /turnstile/);
  return new Response(JSON.stringify({ success: true }));
};
const turnstileNo = async () => new Response(JSON.stringify({ success: false }));
const goodBody = () => ({
  name: 'Alex', email: 'alex@example.com', date: '1990-03-14', time: '08:30', fold: null,
  place: place(krakow), timeSource: 'record', sure: 15, riskAccepted: false,
  consentPrivacy: true, consentWaiver: true, turnstile: 'tok',
});
const URL_ = 'https://cosmicuniversum.com/api/report/order';

async function post(body, envOver = {}) {
  const env = makeEnv({ __fetch: turnstileOk, ...envOver });
  const res = await postOrder(makeCtx({ method: 'POST', url: URL_, body, env }));
  return { res, env, data: await res.json() };
}

test('valid order is saved as pending and sends the customer to Gumroad', async () => {
  const { res, env, data } = await post({ ...goodBody(), place: { ...place(krakow), tz: 'America/New_York' } });
  assert.equal(res.status, 200);
  const keys = env.FILES.keys('orders/pending/');
  assert.equal(keys.length, 1);
  const order = await (await env.FILES.get(keys[0])).json();
  assert.equal(order.birth.tz, 'Europe/Warsaw');
  assert.equal(order.birth.place, 'Kraków, Lesser Poland, PL');
  assert.equal(order.status, 'pending');
  assert.equal(order.consents.privacy, true);
  assert.equal(order.birth.fold, null);
  const u = new URL(data.pay);
  assert.equal(u.origin + u.pathname, 'https://example.gumroad.com/l/report');
  assert.match(u.searchParams.get('order'), /^[a-z0-9]{20}$/);
  assert.equal(u.searchParams.get('order'), order.id);
  assert.equal(u.searchParams.get('email'), 'alex@example.com');
});

const bad = [
  ['name', { name: '  ' }],
  ['name', { name: 'x'.repeat(61) }],
  ['name', { name: 'Al\u0007ex' }],
  ['email', { email: 'alex.example.com' }],
  ['email', { email: 'alex@example' }],
  ['date', { date: '1990-02-30' }],
  ['date', { date: '2099-01-01' }],
  ['time', { time: '' }],
  ['time', { time: '25:00' }],
  ['time', { date: '2021-03-28', time: '02:30' }],            // clocks jumped forward in Poland
  ['fold', { date: '2021-10-31', time: '02:30', fold: null }], // happened twice: must choose
  ['fold', { fold: 1 }],                                     // not a clock change night
  ['place', { place: { ...place(krakow), lat: 50.1 } }],
  ['place', { place: { name: 'Nowhere', country: 'XX', lat: 1, lon: 1 } }],
  ['timeSource', { timeSource: 'astrologer' }],
  ['sure', { sure: 20 }],
  ['riskAccepted', { riskAccepted: 'yes' }],
  ['consentPrivacy', { consentPrivacy: false }],
  ['consentWaiver', { consentWaiver: 'true' }],
];
for (const [field, change] of bad) {
  test(`rejects bad ${field}: ${JSON.stringify(change)}`, async () => {
    const { res, env, data } = await post({ ...goodBody(), ...change });
    assert.equal(res.status, 400);
    assert.equal(data.field, field);
    assert.ok(data.error.length > 10);
    assert.deepEqual(env.FILES.keys(), []);
  });
}

test('clock change night with a choice is accepted', async () => {
  const { res, env } = await post({ ...goodBody(), date: '2021-10-31', time: '02:30', fold: 1 });
  assert.equal(res.status, 200);
  const order = await (await env.FILES.get(env.FILES.keys('orders/pending/')[0])).json();
  assert.equal(order.birth.fold, 1);
});

test('town above 66 degrees is refused before payment', async () => {
  assert.ok(tromso.lat > 66);
  const { res, data } = await post({ ...goodBody(), place: place(tromso) });
  assert.equal(res.status, 400);
  assert.equal(data.field, 'place');
  assert.match(data.error, /far north or south/);
});

test('bad Turnstile token: 403, nothing saved', async () => {
  const { res, env } = await post(goodBody(), { __fetch: turnstileNo });
  assert.equal(res.status, 403);
  assert.deepEqual(env.FILES.keys(), []);
});

test('not JSON: 400', async () => {
  const env = makeEnv({ __fetch: turnstileOk });
  const res = await postOrder(makeCtx({ method: 'POST', url: URL_, body: 'nope', env }));
  assert.equal(res.status, 400);
});

test('waitlist saves the email', async () => {
  const env = makeEnv({ __fetch: turnstileOk });
  const res = await postWaitlist(makeCtx({ method: 'POST', url: URL_, env,
    body: { email: 'alex@example.com', consent: true, turnstile: 'tok' } }));
  assert.equal(res.status, 200);
  const [key] = env.FILES.keys('waitlist/');
  assert.equal((await (await env.FILES.get(key)).json()).email, 'alex@example.com');
});

test('waitlist without consent: 400, nothing saved', async () => {
  const env = makeEnv({ __fetch: turnstileOk });
  const res = await postWaitlist(makeCtx({ method: 'POST', url: URL_, env,
    body: { email: 'alex@example.com', consent: false, turnstile: 'tok' } }));
  assert.equal(res.status, 400);
  assert.deepEqual(env.FILES.keys(), []);
});

test('shop not set up (no Gumroad product): 503, nothing saved', async () => {
  for (const over of [{ GUMROAD_PRODUCT_URL: '' }, { GUMROAD_PRODUCT_ID: '' }]) {
    const { res, env } = await post(goodBody(), over);
    assert.equal(res.status, 503);
    assert.deepEqual(env.FILES.keys(), []);
  }
});

test('far-north waitlist saves the list name and the town', async () => {
  const env = makeEnv({ __fetch: turnstileOk });
  const res = await postWaitlist(makeCtx({ method: 'POST', url: URL_, env,
    body: { email: 'alex@example.com', consent: true, turnstile: 'tok', list: 'polar', town: 'Rovaniemi, Lapland, FI' } }));
  assert.equal(res.status, 200);
  const [key] = env.FILES.keys('waitlist/');
  const saved = await (await env.FILES.get(key)).json();
  assert.equal(saved.list, 'polar');
  assert.equal(saved.town, 'Rovaniemi, Lapland, FI');
});

test('waitlist: default list is notime, unknown list refused, town cut to 120', async () => {
  const env = makeEnv({ __fetch: turnstileOk });
  const send = (extra) => postWaitlist(makeCtx({ method: 'POST', url: URL_, env,
    body: { email: 'alex@example.com', consent: true, turnstile: 'tok', ...extra } }));
  assert.equal((await send({})).status, 200);
  const [k1] = env.FILES.keys('waitlist/');
  assert.equal((await (await env.FILES.get(k1)).json()).list, 'notime');
  assert.equal((await send({ list: 'vip' })).status, 400);
  assert.equal((await send({ list: 'polar', town: 'x'.repeat(300) })).status, 200);
  const polar = await Promise.all(env.FILES.keys('waitlist/').map(async (k) => (await env.FILES.get(k)).json()));
  assert.equal(polar.find((w) => w.list === 'polar').town.length, 120);
});
