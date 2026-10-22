// Browser ephemeris vs the Python oracle (tools/tests/oracle/charts.json).
// Run: node --test tools/tests/ephemeris.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadEphemeris, BODIES } from '../../public/tools/js/ephemeris.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dataDir = path.join(root, 'public', 'tools', 'data');
const charts = JSON.parse(await readFile(path.join(here, 'oracle', 'charts.json'), 'utf8'));

// Loader seam: read the table files from disk instead of over HTTP.
async function diskFetch(url) {
  const name = decodeURIComponent(String(url).split('/').pop());
  const buf = await readFile(path.join(dataDir, name));
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}

const eph = await loadEphemeris({ fetch: diskFetch, baseUrl: 'disk:/data/' });

function jdUtc(iso) {
  return Date.parse(iso) / 86400000 + 2440587.5;
}

function angDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

const NO_RETRO = new Set(['Sun', 'Moon']);

test('ephemeris matches oracle within 0.01 deg', () => {
  let worst = { d: 0 };
  let n = 0;
  for (const c of charts) {
    const jdTT = eph.ttFromUtc(jdUtc(c.input.utc));
    for (const [body, exp] of Object.entries(c.expected.planets)) {
      const got = eph.longitude(body, jdTT);
      const d = angDiff(got.lon, exp.lon);
      if (d > worst.d) worst = { d, body, utc: c.input.utc, got: got.lon, exp: exp.lon };
      assert.ok(d < 0.01, `${body} @ ${c.input.utc}: got ${got.lon}, oracle ${exp.lon} (diff ${d})`);
      n++;
    }
  }
  console.log(`checked ${n} positions, worst ${worst.d.toExponential(2)} deg (${worst.body} ${worst.utc})`);
});

test('speed sign agrees with oracle retro flag', () => {
  for (const c of charts) {
    const jdTT = eph.ttFromUtc(jdUtc(c.input.utc));
    for (const [body, exp] of Object.entries(c.expected.planets)) {
      if (NO_RETRO.has(body)) continue;
      const { speed } = eph.longitude(body, jdTT);
      assert.equal(speed < 0, exp.retro, `${body} @ ${c.input.utc}: speed ${speed}, oracle retro ${exp.retro}`);
      assert.ok(Math.abs(speed - exp.speed) < 0.001, `${body} @ ${c.input.utc}: speed ${speed} vs ${exp.speed}`);
    }
  }
});

test('mean node and mean Lilith match oracle', () => {
  for (const c of charts) {
    const jdTT = eph.ttFromUtc(jdUtc(c.input.utc));
    assert.ok(angDiff(eph.meanNode(jdTT), c.expected.node) < 1e-5, `node @ ${c.input.utc}`);
    assert.ok(angDiff(eph.meanLilith(jdTT), c.expected.lilith) < 1e-5, `lilith @ ${c.input.utc}`);
  }
});

test('covers all bodies and 1900-2100', () => {
  assert.deepEqual([...BODIES].sort(), ['Chiron', 'Jupiter', 'Mars', 'Mercury', 'Moon', 'Neptune',
    'Pluto', 'Saturn', 'Sun', 'Uranus', 'Venus'].sort());
  const [a, b] = eph.range;
  assert.ok(a <= jdUtc('1900-01-01T00:00:00Z') && b >= jdUtc('2100-12-31T23:59:59Z'));
  assert.throws(() => eph.longitude('Sun', a - 10), RangeError);
});

// Civil time before 1972-01-01 ran on GMT/UT, so it is UT1; from 1972 it is UTC with leap seconds.
const JD_1972 = 2441317.5;

test('before 1972: civil time is UT1, TT = UT1 + Delta T', () => {
  for (const iso of ['1879-03-14T10:36:32Z', '1900-01-01T00:00:00Z', '1950-06-15T12:00:00Z',
    '1960-01-01T00:00:00Z', '1971-12-31T23:59:59Z']) {
    const u = jdUtc(iso);
    assert.equal(eph.ut1FromUtc(u), u, `${iso}: ut1 == civil time`);
    const tt = eph.ttFromUtc(u);
    const dtSec = (tt - u) * 86400;
    assert.ok(Math.abs(dtSec - eph.deltaT(tt)) < 1e-3, `${iso}: tt-utc ${dtSec} vs deltaT ${eph.deltaT(tt)}`);
  }
  // Delta T values for sanity: about -5 s in 1879, about +29 s in 1950.
  assert.ok(Math.abs(eph.deltaT(jdUtc('1950-06-15T12:00:00Z')) - 29.1) < 0.5);
});

test('from 1972: leap-second UTC unchanged (TT = UTC + TAI-UTC + 32.184 s)', () => {
  const cases = [['1972-01-01T00:00:00Z', 10], ['1990-06-01T00:00:00Z', 25],
    ['2000-01-01T12:00:00Z', 32], ['2027-01-01T00:00:00Z', 37]];
  for (const [iso, taiUtc] of cases) {
    const u = jdUtc(iso);
    const tt = eph.ttFromUtc(u);
    assert.ok(Math.abs((tt - u) * 86400 - (taiUtc + 32.184)) < 1e-4, `${iso}: tt-utc`);
    assert.ok(Math.abs(eph.ut1FromUtc(u) - (tt - eph.deltaT(tt) / 86400)) < 1e-12, `${iso}: ut1`);
  }
  // Boundary step at 1972-01-01: UT1-UTC jumps from 0 to about -0.04 s; TT jumps by about 0.04 s.
  const before = JD_1972 - 1e-9, after = JD_1972;
  const stepUt1 = ((eph.ut1FromUtc(after) - after) - (eph.ut1FromUtc(before) - before)) * 86400;
  const stepTt = ((eph.ttFromUtc(after) - after) - (eph.ttFromUtc(before) - before)) * 86400;
  assert.ok(Math.abs(stepUt1) < 1, `ut1 step ${stepUt1} s`);
  assert.ok(Math.abs(stepTt) < 1, `tt step ${stepTt} s`);
});

test('1950 chart: angles use civil time as UT1 (13 s RAMC shift vs UTC-as-atomic)', async () => {
  const { angles, gmst } = await import('../../public/tools/js/houses.js');
  const u = jdUtc('1950-06-15T12:00:00Z');
  const lat = 51.5, lon = -0.13;
  // Old rule: UTC treated as atomic time with TAI-UTC = 10 s.
  const ttOld = u + (10 + 32.184) / 86400;
  const ut1Old = ttOld - eph.deltaT(ttOld) / 86400;
  const ut1New = eph.ut1FromUtc(u);
  const shiftSec = (ut1Old - ut1New) * 86400;
  assert.ok(Math.abs(shiftSec - 13) < 0.5, `shift ${shiftSec} s`);
  const ramcShift = ((gmst(ut1Old) - gmst(ut1New) + 540) % 360) - 180;
  assert.ok(Math.abs(ramcShift - 0.054) < 0.003, `RAMC shift ${ramcShift} deg`);
  const ascNew = angles(ut1New, lat, lon).asc, ascOld = angles(ut1Old, lat, lon).asc;
  const d = angDiff(ascOld, ascNew);
  assert.ok(d > 0.03 && d < 0.15, `Ascendant differs by ${d} deg`);
});

test('table files gzip to at most 5 MB', async () => {
  let raw = 0, gz = 0;
  for (const f of await readdir(dataDir)) {
    if (!/^ephem-.*\.bin$|^manifest\.json$/.test(f)) continue;
    const buf = await readFile(path.join(dataDir, f));
    raw += (await stat(path.join(dataDir, f))).size;
    gz += gzipSync(buf, { level: 9 }).length;
  }
  console.log(`ephemeris tables: ${(raw / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzip`);
  assert.ok(gz <= 5e6);
});
