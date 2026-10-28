// Shared shop helpers (functions/_shared/shop.js). Run: node --test tools/tests/shop-lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  randomId, safeEqual, orderKey, putOrder, moveOrder, findOrder, listAll, requireWorker, addAlert, json, nowMs,
} from '../../functions/_shared/shop.js';
import { FakeR2 } from './shop/fake-r2.mjs';
import { makeCtx, makeEnv, bearer } from './shop/ctx.mjs';

test('randomId: 20 chars a-z0-9, unique', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = randomId();
    assert.match(id, /^[a-z0-9]{20}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 1000);
  assert.match(randomId(32), /^[a-z0-9]{32}$/);
});

test('safeEqual', () => {
  assert.equal(safeEqual('a', 'a'), true);
  assert.equal(safeEqual('a', 'b'), false);
  assert.equal(safeEqual('a', 'ab'), false);
  assert.equal(safeEqual(undefined, 'a'), false);
});

const ID = 'abcdefghij0123456789';

test('putOrder writes one key with the status time; moveOrder leaves exactly one key', async () => {
  const b = new FakeR2();
  const order = { id: ID, status: 'pending', createdAt: '2026-11-01T10:00:00.000Z' };
  await putOrder(b, order);
  assert.deepEqual(b.keys(), [orderKey('pending', ID)]);
  assert.equal((await b.get(`orders/pending/${ID}.json`)).customMetadata.at, '2026-11-01T10:00:00.000Z');
  const paid = await moveOrder(b, order, 'paid', { paidAt: '2026-11-01T11:00:00.000Z' });
  assert.equal(paid.status, 'paid');
  assert.deepEqual(b.keys(), [`orders/paid/${ID}.json`]);
  assert.equal((await b.get(`orders/paid/${ID}.json`)).customMetadata.at, '2026-11-01T11:00:00.000Z');
  assert.deepEqual((await findOrder(b, ID)).order.paidAt, '2026-11-01T11:00:00.000Z');
  assert.equal(await findOrder(b, 'nope'), null);
});

test('listAll follows the cursor', async () => {
  const b = new FakeR2();
  for (let i = 0; i < 5; i++) await b.put(`x/${i}`, 'v', { customMetadata: { at: String(i) } });
  const all = await listAll(b, 'x/');
  assert.equal(all.length, 5);
  assert.equal(all[4].customMetadata.at, '4');
});

test('requireWorker', () => {
  const env = makeEnv();
  assert.equal(requireWorker(makeCtx({ env }).request, env).status, 401);
  assert.equal(requireWorker(makeCtx({ env, headers: bearer('wrong') }).request, env).status, 401);
  assert.equal(requireWorker(makeCtx({ env, headers: bearer() }).request, env), null);
});

test('addAlert stores text and time', async () => {
  const b = new FakeR2();
  await addAlert(b, 'Order x needs a look', 1000);
  const [key] = b.keys('alerts/');
  assert.deepEqual(await (await b.get(key)).json(), { text: 'Order x needs a look', at: new Date(1000).toISOString() });
});

test('json adds no-store and noindex', async () => {
  const r = json({ a: 1 }, 201);
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.deepEqual(await r.json(), { a: 1 });
});

test('nowMs uses the test clock', () => {
  assert.equal(nowMs(makeEnv()), Date.parse('2026-11-01T12:00:00Z'));
  assert.ok(Math.abs(nowMs({}) - Date.now()) < 1000);
});
