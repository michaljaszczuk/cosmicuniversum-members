// Saturn return finder for the paid report (tools/report/returns.mjs).
// Run: node --test tools/tests/report-returns.test.mjs
// Uses a made-up natal point (Saturn on 2000-01-01), never real birth data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadEphemeris } from '../../public/tools/js/ephemeris.js';
import { findPasses, groupReturns } from '../report/returns.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', '..', 'public', 'tools', 'data');
async function diskFetch(url) {
  const buf = await readFile(path.join(dataDir, decodeURIComponent(String(url).split('/').pop())));
  return {
    ok: true, status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}
const eph = await loadEphemeris({ fetch: diskFetch, baseUrl: 'disk:/data/' });
const jd = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;
const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

const birth = jd(2000, 1, 1);
const natal = eph.lon('Saturn', birth);

test('passes are exact', () => {
  const passes = findPasses(eph, 'Saturn', natal, birth + 20 * 365.25, jd(2100, 1, 1));
  assert.ok(passes.length >= 2);
  for (const p of passes) assert.ok(Math.abs(wrap180(eph.lon('Saturn', p) - natal)) < 0.01, `JD ${p}`);
});

test('first return near age 29', () => {
  const passes = findPasses(eph, 'Saturn', natal, birth + 20 * 365.25, birth + 95 * 365.25);
  const r = groupReturns(passes, birth, jd(2026, 10, 26))[0];
  assert.equal(r.n, 1);
  assert.ok(r.ageStart === 28 || r.ageStart === 29, `age ${r.ageStart}`);
  assert.ok(r.passes === 1 || r.passes === 3, `passes ${r.passes}`);
  assert.match(r.first, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(r.first <= r.last);
});

test('clipped at the ephemeris end', () => {
  const passes = findPasses(eph, 'Saturn', natal, birth + 20 * 365.25, 2600000);
  assert.ok(passes.every((p) => p <= 2506072.5));
});

test('clipped at the ephemeris start', () => {
  assert.doesNotThrow(() => findPasses(eph, 'Saturn', natal, 2000000, birth));
});

test('status: coming, then past', () => {
  const passes = findPasses(eph, 'Saturn', natal, birth + 20 * 365.25, birth + 40 * 365.25);
  assert.equal(groupReturns(passes, birth, jd(2026, 10, 26))[0].status, 'coming');
  assert.equal(groupReturns(passes, birth, jd(2040, 1, 1))[0].status, 'past');
});
