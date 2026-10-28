// POST /api/report/gumroad-ping. Run: node --test tools/tests/shop-ping.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as ping } from '../../functions/api/report/gumroad-ping.js';
import { putOrder } from '../../functions/_shared/shop.js';
import { makeCtx, makeEnv, PING } from './shop/ctx.mjs';

const ID = 'abcdefghij0123456789';
const SALE = 'sale-123';

function gumroad(sale, { status = 200, success = true } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization') });
    if (status !== 200) return new Response('down', { status });
    return new Response(JSON.stringify(success ? { success: true, sale } : { success: false, message: 'not found' }));
  };
  f.calls = calls;
  return f;
}
const goodSale = (over = {}) => ({
  id: SALE, product_id: 'prod-1', email: 'alex@example.com', refunded: false, chargedback: false, price: 2900, ...over,
});

async function setup({ sale = goodSale(), api = {}, withOrder = true } = {}) {
  const env = makeEnv({ __fetch: gumroad(sale, api) });
  if (withOrder) {
    await putOrder(env.FILES, { id: ID, status: 'pending', createdAt: '2026-11-01T11:00:00.000Z', email: 'alex@example.com',
      name: 'Alex', birth: { date: '1990-03-14' } });
  }
  return env;
}
function send(env, { key = PING, fields = {} } = {}) {
  const form = new URLSearchParams({ sale_id: SALE, product_id: 'obfuscated', 'url_params[order]': ID, email: 'alex@example.com', ...fields });
  return ping(makeCtx({ method: 'POST', url: `https://cosmicuniversum.com/api/report/gumroad-ping?key=${encodeURIComponent(key)}`,
    body: form, env }));
}
const alerts = async (env) => Promise.all(env.FILES.keys('alerts/').map(async (k) => (await (await env.FILES.get(k)).json()).text));
const read = async (env, key) => (await env.FILES.get(key))?.json();

test('wrong key: 403, nothing changes', async () => {
  const env = await setup();
  assert.equal((await send(env, { key: 'wrong' })).status, 403);
  assert.deepEqual(env.FILES.keys(), [`orders/pending/${ID}.json`]);
  assert.equal(env.__fetch.calls.length, 0);
});

test('valid sale: order becomes paid; the API is asked with the token', async () => {
  const env = await setup();
  assert.equal((await send(env)).status, 200);
  const o = await read(env, `orders/paid/${ID}.json`);
  assert.equal(o.status, 'paid');
  assert.equal(o.sale_id, SALE);
  assert.equal(o.test, false);
  assert.equal(o.beta, false);
  assert.equal(o.emailMismatch, false);
  assert.equal(o.paidAt, '2026-11-01T12:00:00.000Z');
  assert.deepEqual(await read(env, `sales/${SALE}.json`), { id: ID });
  assert.equal(env.FILES.keys('orders/pending/').length, 0);
  assert.equal(env.__fetch.calls[0].url, `https://api.gumroad.com/v2/sales/${SALE}`);
  assert.equal(env.__fetch.calls[0].auth, 'Bearer test-gumroad-token');
  assert.deepEqual(await alerts(env), []);
});

test('the same ping twice: one paid order, one sales key', async () => {
  const env = await setup();
  await send(env);
  assert.equal((await send(env)).status, 200);
  assert.deepEqual(env.FILES.keys('orders/'), [`orders/paid/${ID}.json`]);
  assert.deepEqual(env.FILES.keys('sales/'), [`sales/${SALE}.json`]);
});

test('test purchase and 100% code are marked', async () => {
  const env = await setup({ sale: goodSale({ price: 0 }) });
  await send(env, { fields: { test: 'true' } });
  const o = await read(env, `orders/paid/${ID}.json`);
  assert.equal(o.test, true);
  assert.equal(o.beta, true);
});

test('Gumroad API down: 502 so Gumroad retries, order marked, alert', async () => {
  const env = await setup({ api: { status: 500 } });
  assert.equal((await send(env)).status, 502);
  const o = await read(env, `orders/pending/${ID}.json`);
  assert.equal(o.pingFailedAt, '2026-11-01T12:00:00.000Z');
  assert.match((await alerts(env))[0], /Gumroad check failed for sale sale-123/);
});

test('API says no such sale: 502 and alert', async () => {
  const env = await setup({ api: { success: false } });
  assert.equal((await send(env)).status, 502);
  assert.equal((await alerts(env)).length, 1);
});

test('other product: alert, order stays pending', async () => {
  const env = await setup({ sale: goodSale({ product_id: 'other' }) });
  assert.equal((await send(env)).status, 200);
  assert.ok(await read(env, `orders/pending/${ID}.json`));
  assert.match((await alerts(env))[0], /other product/);
});

test('refunded or disputed sale: alert, nothing deleted', async () => {
  for (const over of [{ refunded: true }, { chargedback: true }]) {
    const env = await setup({ sale: goodSale(over) });
    await send(env);
    assert.equal((await send(env)).status, 200);
    assert.ok(await read(env, `orders/pending/${ID}.json`));
    assert.match((await alerts(env))[0], /refunded or disputed.*order abcdefghij0123456789/);
  }
});

test('refund ping after delivery: alert, delivered record kept', async () => {
  const env = await setup();
  await send(env);
  const paid = await read(env, `orders/paid/${ID}.json`);
  await env.FILES.delete(`orders/paid/${ID}.json`);
  await putOrder(env.FILES, { ...paid, status: 'delivered', deliveredAt: '2026-11-01T12:05:00.000Z' });
  env.__fetch = gumroad(goodSale({ refunded: true }));
  assert.equal((await send(env)).status, 200);
  assert.ok(await read(env, `orders/delivered/${ID}.json`));
  assert.equal((await alerts(env)).length, 1);
});

test('unknown order with a real sale: orphan record and alert', async () => {
  const env = await setup({ withOrder: false });
  assert.equal((await send(env)).status, 200);
  const orphan = await read(env, `orders/orphan/${SALE}.json`);
  assert.equal(orphan.sale_id, SALE);
  assert.match((await alerts(env))[0], /paid but the order form data is missing/);
});

test('different email at checkout: still paid, flagged, alert', async () => {
  const env = await setup({ sale: goodSale({ email: 'other@example.com', purchase_email: 'other@example.com' }) });
  await send(env);
  const o = await read(env, `orders/paid/${ID}.json`);
  assert.equal(o.emailMismatch, true);
  assert.equal(o.email, 'alex@example.com');
  assert.match((await alerts(env))[0], /email/);
  assert.doesNotMatch((await alerts(env))[0], /@/);
});

test('email compare ignores case', async () => {
  const env = await setup({ sale: goodSale({ email: 'ALEX@example.com' }) });
  await send(env);
  assert.equal((await read(env, `orders/paid/${ID}.json`)).emailMismatch, false);
});
