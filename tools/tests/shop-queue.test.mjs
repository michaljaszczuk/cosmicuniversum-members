// Queue API for the VPS worker and the PDF download link. Run: node --test tools/tests/shop-queue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as next } from '../../functions/api/report/next.js';
import { onRequestPut as upload } from '../../functions/api/report/file/[id].js';
import { onRequestPost as setStatus } from '../../functions/api/report/status/[id].js';
import { onRequestPost as retry } from '../../functions/api/report/retry/[id].js';
import { onRequestGet as delivered } from '../../functions/api/report/delivered.js';
import { onRequestGet as feedbackDue } from '../../functions/api/report/feedback-due.js';
import { onRequestPost as inbox } from '../../functions/api/report/inbox.js';
import { onRequestPost as inboxAck } from '../../functions/api/report/inbox-ack.js';
import { onRequestPost as postAlert } from '../../functions/api/report/alert.js';
import { onRequestPost as recheck } from '../../functions/api/report/recheck/[id].js';
import { onRequestPost as cleanup } from '../../functions/api/report/cleanup.js';
import { onRequestGet as download } from '../../functions/r/[token].js';
import { putOrder, addAlert, DAY } from '../../functions/_shared/shop.js';
import { makeCtx, makeEnv, bearer } from './shop/ctx.mjs';

const BASE = 'https://cosmicuniversum.com';
const T0 = Date.parse('2026-11-01T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const id = (n) => `order${String(n).padStart(15, '0')}`;
const birth = { date: '1990-03-14', time: '08:30', place: 'Kraków, Lesser Poland, PL', lat: 50.06, lon: 19.94, tz: 'Europe/Warsaw' };

function call(handler, env, { method = 'POST', path = '/', body, params = {}, auth = true } = {}) {
  return handler(makeCtx({ method, url: BASE + path, body, env, params, headers: auth ? bearer() : {} }));
}
const read = async (env, key) => (await env.FILES.get(key))?.json();
async function paid(env, n, paidAt, extra = {}) {
  const o = { id: id(n), status: 'paid', createdAt: iso(paidAt - 60000), paidAt: iso(paidAt), email: 'alex@example.com',
    name: 'Alex', birth, sale_id: `s${n}`, ...extra };
  await putOrder(env.FILES, o);
  return o;
}
async function deliveredOrder(env, n, deliveredAt, extra = {}) {
  const o = { id: id(n), status: 'delivered', createdAt: iso(deliveredAt - DAY), deliveredAt: iso(deliveredAt),
    email: 'alex@example.com', name: 'Alex', sale_id: `s${n}`, ...extra };
  await putOrder(env.FILES, o);
  return o;
}

test('every worker endpoint needs the bearer', async () => {
  const env = makeEnv();
  const p = { id: id(1) };
  for (const [h, method] of [[next], [upload, 'PUT'], [setStatus], [retry], [delivered, 'GET'], [feedbackDue, 'GET'], [inbox], [inboxAck], [postAlert], [recheck], [cleanup]]) {
    assert.equal((await call(h, env, { method, params: p, auth: false, path: '/?email=a@b.co' })).status, 401);
  }
});

test('next: oldest paid first, then 204 when empty', async () => {
  const env = makeEnv();
  await paid(env, 2, T0 - 1000);
  await paid(env, 1, T0 - 5000);
  const r1 = await call(next, env);
  assert.equal(r1.status, 200);
  const { order } = await r1.json();
  assert.equal(order.id, id(1));
  assert.equal(order.status, 'working');
  assert.equal(order.leaseUntil, iso(T0 + 30 * 60000));
  assert.deepEqual(order.birth, birth);
  assert.ok(await read(env, `orders/working/${id(1)}.json`));
  assert.equal((await (await call(next, env)).json()).order.id, id(2));
  assert.equal((await call(next, env)).status, 204);
});

test('expired lease returns the order; the third expiry fails it with an alert', async () => {
  const env = makeEnv();
  await paid(env, 1, T0 - 1000);
  for (let i = 1; i <= 2; i++) {
    assert.equal((await (await call(next, env)).json()).order.id, id(1));
    env.__setNow(env.__now() + 31 * 60000);
  }
  const third = await call(next, env);
  assert.equal((await third.json()).order.leases, 2);
  env.__setNow(env.__now() + 31 * 60000);
  const last = await call(next, env);
  assert.equal(last.status, 200);
  assert.deepEqual(await last.json(), { order: null, failedNow: [{ id: id(1), email: 'alex@example.com', name: 'Alex' }] });
  const f = await read(env, `orders/failed/${id(1)}.json`);
  assert.equal(f.failReason, 'lease expired 3 times');
  const [a] = env.FILES.keys('alerts/');
  assert.match((await read(env, a)).text, new RegExp(id(1)));
});

test('upload then download: same bytes, safe file name, no-store', async () => {
  const env = makeEnv();
  await paid(env, 1, T0, { name: "Zoë O'Brien/x" });
  await call(next, env);
  const pdf = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
  const up = await call(upload, env, { method: 'PUT', body: pdf, params: { id: id(1) } });
  assert.equal(up.status, 200);
  const { url } = await up.json();
  const token = url.split('/r/')[1];
  assert.match(token, /^[a-z0-9]{32}$/);
  assert.equal(url, `${BASE}/r/${token}`);
  assert.equal((await read(env, `orders/working/${id(1)}.json`)).token, token);
  const res = await download(makeCtx({ url, env, params: { token } }));
  assert.equal(res.status, 200);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), pdf);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  assert.match(res.headers.get('content-disposition'), /^attachment; filename="Zoe-O-Brien-x_birth-chart\.pdf"; filename\*=UTF-8''/);
});

test('upload only for a working order', async () => {
  const env = makeEnv();
  await paid(env, 1, T0);
  assert.equal((await call(upload, env, { method: 'PUT', body: new Uint8Array([1]), params: { id: id(1) } })).status, 409);
});

test('empty name gives "Your" in the file name; unknown token 404', async () => {
  const env = makeEnv();
  await paid(env, 1, T0, { name: '张伟' });
  await call(next, env);
  const { url } = await (await call(upload, env, { method: 'PUT', body: new Uint8Array([1]), params: { id: id(1) } })).json();
  const token = url.split('/r/')[1];
  const res = await download(makeCtx({ url, env, params: { token } }));
  assert.match(res.headers.get('content-disposition'), /filename="Your_birth-chart\.pdf"/);
  assert.equal((await download(makeCtx({ url, env, params: { token: 'x'.repeat(32) } }))).status, 404);
  assert.equal((await download(makeCtx({ url, env, params: { token: '../alerts' } }))).status, 404);
});

test('delivered: birth data removed, time set', async () => {
  const env = makeEnv();
  await paid(env, 1, T0);
  await call(next, env);
  const r = await call(setStatus, env, { body: { status: 'delivered' }, params: { id: id(1) } });
  assert.equal(r.status, 200);
  const d = await read(env, `orders/delivered/${id(1)}.json`);
  assert.equal('birth' in d, false);
  assert.equal(d.deliveredAt, iso(T0));
  assert.equal(d.email, 'alex@example.com');
  assert.equal(env.FILES.keys('orders/working/').length, 0);
});

test('failed: reason cut to 200 chars; flags update in place; unknown id 404', async () => {
  const env = makeEnv();
  await paid(env, 1, T0);
  await call(next, env);
  await call(setStatus, env, { body: { status: 'failed', reason: 'x'.repeat(300) }, params: { id: id(1) } });
  const f = await read(env, `orders/failed/${id(1)}.json`);
  assert.equal(f.failReason.length, 200);
  await call(setStatus, env, { body: { delayMailSent: true }, params: { id: id(1) } });
  assert.equal((await read(env, `orders/failed/${id(1)}.json`)).delayMailSent, true);
  assert.equal((await call(setStatus, env, { body: { status: 'delivered' }, params: { id: id(9) } })).status, 404);
});

test('status change only from working', async () => {
  const env = makeEnv();
  await paid(env, 1, T0);
  assert.equal((await call(setStatus, env, { body: { status: 'delivered' }, params: { id: id(1) } })).status, 409);
});

test('retry: failed back to paid', async () => {
  const env = makeEnv();
  await putOrder(env.FILES, { id: id(1), status: 'failed', failedAt: iso(T0), failReason: 'x', leases: 3, birth });
  assert.equal((await call(retry, env, { params: { id: id(1) } })).status, 200);
  const o = await read(env, `orders/paid/${id(1)}.json`);
  assert.equal(o.leases, 0);
  assert.equal('failReason' in o, false);
  assert.equal(o.paidAt, iso(T0));
});

test('delivered?email= finds recent orders, any case', async () => {
  const env = makeEnv();
  await deliveredOrder(env, 1, T0 - 2 * DAY, { token: 't'.repeat(32) });
  await deliveredOrder(env, 2, T0 - 31 * DAY, { token: 'u'.repeat(32) });
  const r = await call(delivered, env, { method: 'GET', path: '/api/report/delivered?email=ALEX@example.com' });
  assert.deepEqual(await r.json(), [{ id: id(1), name: 'Alex', url: `${BASE}/r/${'t'.repeat(32)}` }]);
});

test('feedback-due: beta, 3+ days, not sent yet', async () => {
  const env = makeEnv();
  await deliveredOrder(env, 1, T0 - 4 * DAY, { beta: true });
  await deliveredOrder(env, 2, T0 - 1 * DAY, { beta: true });
  await deliveredOrder(env, 3, T0 - 4 * DAY, { beta: false });
  await deliveredOrder(env, 4, T0 - 4 * DAY, { beta: true, feedbackSent: true });
  const r = await call(feedbackDue, env, { method: 'GET' });
  assert.deepEqual(await r.json(), [{ id: id(1), email: 'alex@example.com', name: 'Alex' }]);
});

test('inbox hands out alerts and waitlist with keys and keeps them until ack', async () => {
  const env = makeEnv();
  await addAlert(env.FILES, 'hello', T0);
  await env.FILES.put('waitlist/1-x.json', JSON.stringify({ email: 'w@example.com', at: iso(T0) }));
  await env.FILES.put('waitlist/2-y.json', JSON.stringify({ email: 'p@example.com', list: 'polar', town: 'Rovaniemi, Lapland, FI', at: iso(T0) }));
  const r = await (await call(inbox, env)).json();
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].text, 'hello');
  assert.match(r.alerts[0].key, /^alerts\//);
  assert.deepEqual(r.waitlist, [
    { key: 'waitlist/1-x.json', email: 'w@example.com', list: 'notime', town: '' },
    { key: 'waitlist/2-y.json', email: 'p@example.com', list: 'polar', town: 'Rovaniemi, Lapland, FI' },
  ]);
  assert.equal(env.FILES.keys('alerts/').length, 1);
  assert.equal(env.FILES.keys('waitlist/').length, 2);
  const ack = await call(inboxAck, env, { body: { keys: [r.alerts[0].key, 'orders/paid/x.json'] } });
  assert.equal(ack.status, 200);
  assert.deepEqual(await ack.json(), { deleted: 1 });
  assert.deepEqual(env.FILES.keys('alerts/'), []);
  assert.equal(env.FILES.keys('waitlist/').length, 2);
});

test('alert endpoint stores an alert for the next run', async () => {
  const env = makeEnv();
  assert.equal((await call(postAlert, env, { body: { text: 'Order x needs a look' } })).status, 200);
  const [k] = env.FILES.keys('alerts/');
  assert.equal((await read(env, k)).text, 'Order x needs a look');
  assert.equal((await call(postAlert, env, { body: { text: '' } })).status, 400);
});

test('recheck: a kept pending order with a good sale becomes paid', async () => {
  const env = makeEnv({ __fetch: async () => new Response(JSON.stringify({ success: true, sale: {
    id: 's9', product_id: 'prod-1', email: 'alex@example.com', refunded: false, chargedback: false, price: 2900 } })) });
  await putOrder(env.FILES, { id: id(1), status: 'pending', createdAt: iso(T0 - 2 * DAY), email: 'alex@example.com',
    name: 'Alex', birth, pingFailedAt: iso(T0 - DAY), pingSaleId: 's9' });
  const r = await call(recheck, env, { params: { id: id(1) } });
  assert.equal(r.status, 200);
  const o = await read(env, `orders/paid/${id(1)}.json`);
  assert.equal(o.sale_id, 's9');
  assert.deepEqual(await read(env, 'sales/s9.json'), { id: id(1) });
});

test('recheck: no known sale or bad sale is refused', async () => {
  const env = makeEnv({ __fetch: async () => new Response('down', { status: 500 }) });
  await putOrder(env.FILES, { id: id(1), status: 'pending', createdAt: iso(T0), birth });
  assert.equal((await call(recheck, env, { params: { id: id(1) } })).status, 409);
  await putOrder(env.FILES, { id: id(2), status: 'pending', createdAt: iso(T0), birth, pingSaleId: 's1' });
  assert.equal((await call(recheck, env, { params: { id: id(2) } })).status, 502);
  assert.ok(await read(env, `orders/pending/${id(2)}.json`));
});

test('cleanup keeps a pending order whose product id did not match', async () => {
  const env = makeEnv();
  await putOrder(env.FILES, { id: id(1), status: 'pending', createdAt: iso(T0 - 25 * 3600000), productMismatchAt: iso(T0), birth });
  assert.equal((await (await call(cleanup, env)).json()).pending, 0);
});

test('cleanup: 24 h pending rule keeps orders whose ping failed', async () => {
  const env = makeEnv();
  await putOrder(env.FILES, { id: id(1), status: 'pending', createdAt: iso(T0 - 25 * 3600000), birth });
  await putOrder(env.FILES, { id: id(2), status: 'pending', createdAt: iso(T0 - 25 * 3600000), pingFailedAt: iso(T0 - DAY), birth });
  await putOrder(env.FILES, { id: id(3), status: 'pending', createdAt: iso(T0 - 23 * 3600000), birth });
  const r = await (await call(cleanup, env)).json();
  assert.equal(r.pending, 1);
  assert.deepEqual(env.FILES.keys('orders/pending/'), [`orders/pending/${id(2)}.json`, `orders/pending/${id(3)}.json`]);
});

test('cleanup: 30 days after delivery the record, PDF and token go', async () => {
  const env = makeEnv();
  await paid(env, 1, T0);
  await call(next, env);
  const { url } = await (await call(upload, env, { method: 'PUT', body: new Uint8Array([1]), params: { id: id(1) } })).json();
  await call(setStatus, env, { body: { status: 'delivered' }, params: { id: id(1) } });
  const token = url.split('/r/')[1];
  env.__setNow(T0 + 29 * DAY);
  assert.deepEqual(await (await call(cleanup, env)).json(), { pending: 0, delivered: 0, tokens: 0 });
  assert.equal((await download(makeCtx({ url, env, params: { token } }))).status, 200);
  env.__setNow(T0 + 31 * DAY);
  assert.deepEqual(await (await call(cleanup, env)).json(), { pending: 0, delivered: 1, tokens: 1 });
  assert.deepEqual(env.FILES.keys(), []);
  assert.equal((await download(makeCtx({ url, env, params: { token } }))).status, 404);
});

test('expired token gives 404 even before cleanup', async () => {
  const env = makeEnv();
  await env.FILES.put(`tokens/${'a'.repeat(32)}.json`, JSON.stringify({ id: id(1), name: 'Alex', expiresAt: iso(T0 - 1) }));
  await env.FILES.put(`reports/${id(1)}.pdf`, new Uint8Array([1]));
  assert.equal((await download(makeCtx({ env, params: { token: 'a'.repeat(32) } }))).status, 404);
});

test('a broken file in the queue is moved aside with an alert and does not block the queue', async () => {
  const env = makeEnv();
  await env.FILES.put('orders/paid/.json', '');
  await env.FILES.put(`orders/working/${id(8)}.json`, '{not json', { customMetadata: { at: iso(T0 - 1) } });
  await paid(env, 1, T0 - 1000);
  const r = await call(next, env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).order.id, id(1));
  assert.deepEqual(env.FILES.keys('orders/paid/'), []);
  assert.deepEqual(env.FILES.keys('orders/working/'), [`orders/working/${id(1)}.json`]);
  assert.equal(env.FILES.keys('orders/broken/').length, 2);
  assert.equal(env.FILES.keys('alerts/').length, 2);
});
