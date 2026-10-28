// Birth time safety window (public/tools/js/timewindow.js). Demo person only.
// Run: node --test tools/tests/timewindow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadEphemeris } from '../../public/tools/js/ephemeris.js';
import { angles } from '../../public/tools/js/houses.js';
import { signOf } from '../../public/tools/js/chart.js';
import { jdFromDate } from '../../public/tools/js/time.js';
import { timeWindow, fitsWindow, clockText } from '../../public/tools/js/timewindow.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
async function diskFetch(url) {
  const buf = await readFile(path.join(root, 'public/tools/data', decodeURIComponent(String(url).split('/').pop())));
  return {
    ok: true, status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}
const eph = await loadEphemeris({ fetch: diskFetch, baseUrl: 'disk:/data/' });
const demo = { utc: new Date('1990-03-14T07:30:00Z'), lat: 50.0647, lon: 19.945 };
const MIN = 60000;

function signsAt(utc, { lat, lon }) {
  const jd = jdFromDate(utc);
  const a = angles(eph.ut1FromUtc(jd), lat, lon);
  return { Rising: signOf(a.asc), Moon: signOf(eph.longitude('Moon', eph.ttFromUtc(jd)).lon), Midheaven: signOf(a.mc) };
}

test('signs inside the window are the same, the next minute outside differs', () => {
  const w = timeWindow(demo, eph);
  assert.ok(w.from <= demo.utc && demo.utc <= w.to);
  const here = signsAt(demo.utc, demo);
  assert.deepEqual({ Rising: w.rising, Moon: w.moon, Midheaven: w.mc }, here);
  assert.deepEqual(signsAt(w.from, demo), here);
  assert.deepEqual(signsAt(w.to, demo), here);
  if (w.toCause !== 'edge') assert.notEqual(signsAt(new Date(+w.to + MIN), demo)[w.toCause], here[w.toCause]);
  if (w.fromCause !== 'edge') assert.notEqual(signsAt(new Date(+w.from - MIN), demo)[w.fromCause], here[w.fromCause]);
  assert.ok(+w.to - +demo.utc <= 180 * MIN && +demo.utc - +w.from <= 180 * MIN);
});

test('near a change: 5 minutes before the end of the window', () => {
  const w = timeWindow(demo, eph);
  const near = { ...demo, utc: new Date(+w.to - 5 * MIN) };
  const w2 = timeWindow(near, eph);
  assert.equal(fitsWindow(w2, near.utc, 0), true);
  assert.equal(fitsWindow(w2, near.utc, 15), false);
});

test('far from a change: the middle of the window fits 15 minutes', () => {
  const w = timeWindow(demo, eph);
  const mid = { ...demo, utc: new Date(Math.round((+w.from + +w.to) / 2 / MIN) * MIN) };
  assert.ok(+w.to - +w.from >= 40 * MIN, 'demo window is long enough for this test');
  assert.equal(fitsWindow(timeWindow(mid, eph), mid.utc, 15), true);
});

test('polar: no Rising sign gives null', () => {
  assert.equal(timeWindow({ ...demo, lat: 89 }, eph), null);
});

test('clockText', () => {
  assert.equal(clockText(new Date('1990-03-14T05:42:00Z'), 'Europe/Warsaw', '1990-03-14'), '06:42');
  assert.equal(clockText(new Date('1990-03-13T22:10:00Z'), 'Europe/Warsaw', '1990-03-14'), '23:10 the day before');
  assert.equal(clockText(new Date('1990-03-14T23:20:00Z'), 'Europe/Warsaw', '1990-03-14'), '00:20 the next day');
});
