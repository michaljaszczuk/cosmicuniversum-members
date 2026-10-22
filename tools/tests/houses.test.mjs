// Angles, whole sign houses and points vs the Python oracle (tools/tests/oracle/charts.json).
// Run: node --test tools/tests/houses.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadEphemeris } from '../../public/tools/js/ephemeris.js';
import { jdFromDate } from '../../public/tools/js/time.js';
import { angles, wholeSignHouse } from '../../public/tools/js/houses.js';
import { fortune, isDayChart, southNode } from '../../public/tools/js/points.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dataDir = path.join(root, 'public', 'tools', 'data');
const charts = JSON.parse(await readFile(path.join(here, 'oracle', 'charts.json'), 'utf8'));
const timed = charts.filter((c) => c.input.hasTime);

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

// The oracle evaluates sidereal time at UT1 (Skyfield t.ut1).
const jdUT1 = (c) => eph.ut1FromUtc(jdFromDate(new Date(c.input.utc)));
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const TOL = 0.02;

// Longitudes the oracle assigned a whole sign house to.
function pointLons(e) {
  const out = {};
  for (const [k, v] of Object.entries(e.planets)) out[k] = v.lon;
  Object.assign(out, {
    NorthNode: e.node, SouthNode: e.southNode, Lilith: e.lilith,
    Fortune: e.fortune, Vertex: e.vertex, Ascendant: e.asc, MC: e.mc,
  });
  return out;
}

test('angDiff handles wraparound', () => {
  assert.ok(angDiff(359.99, 0.01) < 0.0201);
  assert.ok(angDiff(0.01, 359.99) < 0.0201);
  assert.equal(angDiff(10, 190), 180);
});

test(`asc, mc, vertex match oracle within ${TOL} deg (${timed.length} timed charts)`, () => {
  let worst = 0;
  for (const c of timed) {
    const { lat, lon, utc } = c.input;
    const e = c.expected;
    const a = angles(jdUT1(c), lat, lon);
    assert.notEqual(a.asc, null, `asc null @ ${utc} lat ${lat}`);
    assert.notEqual(a.vertex, null, `vertex null @ ${utc} lat ${lat}`);
    for (const k of ['asc', 'mc', 'vertex']) {
      const d = angDiff(a[k], e[k]);
      worst = Math.max(worst, d);
      assert.ok(d < TOL, `${k} @ ${utc} (${lat},${lon}): got ${a[k]}, oracle ${e[k]} (diff ${d})`);
      assert.ok(a[k] >= 0 && a[k] < 360, `${k} out of range: ${a[k]}`);
    }
  }
  console.log(`angles: worst diff ${worst.toExponential(2)} deg`);
});

test('whole sign houses equal oracle for every point', () => {
  for (const c of timed) {
    const e = c.expected;
    const asc = angles(jdUT1(c), c.input.lat, c.input.lon).asc;
    for (const [k, L] of Object.entries(pointLons(e))) {
      if (k === 'Ascendant' || k === 'MC') continue; // oracle fixes these to 1 and 10 (MC sign may differ)
      assert.equal(wholeSignHouse(L, asc), e.houses[k], `${k} @ ${c.input.utc}`);
    }
    assert.equal(wholeSignHouse(asc, asc), 1);
  }
});

test('wholeSignHouse basics', () => {
  assert.equal(wholeSignHouse(5, 15), 1);
  assert.equal(wholeSignHouse(29.999, 0), 1);
  assert.equal(wholeSignHouse(30, 0), 2);
  assert.equal(wholeSignHouse(359, 0), 12);
  assert.equal(wholeSignHouse(0, 359), 2);
  assert.equal(wholeSignHouse(360, 0), 1);
  assert.equal(wholeSignHouse(-1, 0), 12);
});

test(`Part of Fortune and day/night match oracle (oracle Sun/Moon), within ${TOL} deg`, () => {
  for (const c of timed) {
    const e = c.expected;
    const asc = angles(jdUT1(c), c.input.lat, c.input.lon).asc;
    const sun = e.planets.Sun.lon, moon = e.planets.Moon.lon;
    const isDay = isDayChart(wholeSignHouse(sun, asc));
    assert.equal(isDay, e.fortuneIsDay, `isDay @ ${c.input.utc}`);
    const pof = fortune(asc, sun, moon, isDay);
    assert.ok(angDiff(pof, e.fortune) < TOL, `fortune @ ${c.input.utc}: ${pof} vs ${e.fortune}`);
    assert.ok(pof >= 0 && pof < 360);
  }
});

test('Part of Fortune with real ephemeris Sun/Moon matches oracle', () => {
  for (const c of timed) {
    const e = c.expected;
    const jdUtc = jdFromDate(new Date(c.input.utc));
    const jdTT = eph.ttFromUtc(jdUtc);
    const asc = angles(eph.ut1FromUtc(jdUtc), c.input.lat, c.input.lon).asc;
    const sun = eph.lon('Sun', jdTT), moon = eph.lon('Moon', jdTT);
    const isDay = isDayChart(wholeSignHouse(sun, asc));
    assert.equal(isDay, e.fortuneIsDay, `isDay @ ${c.input.utc}`);
    const pof = fortune(asc, sun, moon, isDay);
    assert.ok(angDiff(pof, e.fortune) < TOL, `fortune @ ${c.input.utc}: ${pof} vs ${e.fortune}`);
  }
});

test('isDayChart: houses 7-12 are day', () => {
  for (let h = 1; h <= 12; h++) assert.equal(isDayChart(h), h >= 7);
});

test('fortune formula and wraparound', () => {
  assert.equal(fortune(10, 350, 20, true), 40);   // 10 + 20 - 350 = -320 -> 40
  assert.equal(fortune(10, 350, 20, false), 340); // 10 + 350 - 20 = 340
  assert.equal(fortune(0, 0, 0, true), 0);
});

test('southNode is node + 180 and matches oracle', () => {
  assert.equal(southNode(0), 180);
  assert.equal(southNode(270), 90);
  assert.equal(southNode(180), 0);
  for (const c of charts) {
    if (c.expected.southNode == null) continue;
    assert.ok(angDiff(southNode(c.expected.node), c.expected.southNode) < 1e-6);
  }
});

test('polar latitude: lat 80 and -80 give asc === null, mc still defined', () => {
  const jd = jdFromDate(new Date('2000-06-21T12:00:00Z'));
  for (const lat of [80, -80, 70]) {
    const a = angles(jd, lat, 20);
    assert.equal(a.asc, null, `lat ${lat}`);
    assert.ok(Number.isFinite(a.mc) && a.mc >= 0 && a.mc < 360);
  }
});

test('lat 65.95 (oracle "Finland 66N") is still defined and matches', () => {
  const fin = timed.filter((c) => c.input.lat === 65.95);
  assert.ok(fin.length > 0, 'oracle has 65.95 charts');
  for (const c of fin) {
    const a = angles(jdUT1(c), c.input.lat, c.input.lon);
    assert.notEqual(a.asc, null);
    assert.ok(angDiff(a.asc, c.expected.asc) < TOL);
  }
  // and over a whole sidereal day at 65.95 the Ascendant stays defined
  const jd0 = jdFromDate(new Date('2000-12-21T00:00:00Z'));
  for (let i = 0; i < 96; i++) assert.notEqual(angles(jd0 + i / 96, 65.95, 26).asc, null);
});
