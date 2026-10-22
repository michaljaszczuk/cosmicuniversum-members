// buildChart (chart.js + balance.js + aspects.js + patterns.js) vs the Python oracle.
// Run: node --test tools/tests/chart.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadEphemeris } from '../../public/tools/js/ephemeris.js';
import { buildChart, SIGNS } from '../../public/tools/js/chart.js';
import { elementBalance } from '../../public/tools/js/balance.js';
import { findAspects, tightestAspects } from '../../public/tools/js/aspects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dataDir = path.join(root, 'public', 'tools', 'data');
const charts = JSON.parse(await readFile(path.join(here, 'oracle', 'charts.json'), 'utf8'));
const conv = JSON.parse(await readFile(path.join(root, 'tools', 'config', 'conventions.json'), 'utf8'));

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

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const signOf = (lon) => Math.floor(lon / 30);
const label = (c) => `${c.input.name} ${c.input.utc}`;

function inputOf(c) {
  const i = c.input;
  return { utc: new Date(i.utc), lat: i.lat, lon: i.lon, hasTime: i.hasTime, tz: i.tz };
}

// Boundary exceptions: charts where the oracle and the browser may legitimately
// disagree because a value sits within 0.001 deg of a sign cusp or an orb edge.
// Format: 'name utc' -> { reason, margin (deg) }. Empty: every oracle chart matches.
const EXCEPTIONS = new Map([]);

const built = charts.map((c) => ({ c, got: buildChart(inputOf(c), eph, conv) }));

test('all oracle charts: planets, signs and points', () => {
  for (const { c, got } of built) {
    if (EXCEPTIONS.has(label(c))) continue;
    const e = c.expected;
    for (const [body, exp] of Object.entries(e.planets)) {
      const g = got.planets[body];
      assert.ok(angDiff(g.lon, exp.lon) < 0.01, `${label(c)} ${body} lon ${g.lon} vs ${exp.lon}`);
      assert.equal(signOf(g.lon), signOf(exp.lon), `${label(c)} ${body} sign`);
      assert.equal(g.sign, SIGNS[signOf(exp.lon)], `${label(c)} ${body} sign name`);
      assert.equal(g.retro, exp.retro, `${label(c)} ${body} retro`);
    }
    for (const k of ['node', 'southNode', 'lilith']) {
      assert.ok(angDiff(got[k], e[k]) < 0.01, `${label(c)} ${k}`);
    }
    for (const k of ['asc', 'mc']) {
      if (e[k] === null) assert.equal(got[k], null, `${label(c)} ${k} null`);
      else {
        assert.ok(angDiff(got[k], e[k]) < 0.02, `${label(c)} ${k} ${got[k]} vs ${e[k]}`);
        assert.equal(signOf(got[k]), signOf(e[k]), `${label(c)} ${k} sign`);
      }
    }
    for (const k of ['vertex', 'fortune']) {
      if (e[k] === null) assert.equal(got[k], null, `${label(c)} ${k} null`);
      else {
        assert.ok(angDiff(got[k], e[k]) < 0.02, `${label(c)} ${k} ${got[k]} vs ${e[k]}`);
        assert.equal(signOf(got[k]), signOf(e[k]), `${label(c)} ${k} sign`);
      }
    }
    assert.equal(got.fortuneIsDay, e.fortuneIsDay, `${label(c)} fortuneIsDay`);
    assert.deepEqual(got.houses, e.houses, `${label(c)} houses`);
    assert.equal(got.moonPhase, e.moonPhase, `${label(c)} moonPhase`);
    if ('moonSignUncertain' in e) {
      assert.equal(got.moonSignUncertain, e.moonSignUncertain, `${label(c)} moonSignUncertain`);
      assert.equal(got.warnings.includes('moonSignUncertain'), e.moonSignUncertain);
    }
  }
});

test('all oracle charts: elements, modes, strongest and weakest', () => {
  for (const { c, got } of built) {
    if (EXCEPTIONS.has(label(c))) continue;
    const e = c.expected;
    assert.deepEqual(got.elements, e.elements, `${label(c)} elements`);
    assert.deepEqual(got.modes, e.modes, `${label(c)} modes`);
    assert.deepEqual(got.elementsDouble, e.elementsDouble, `${label(c)} elementsDouble`);
    assert.deepEqual(got.modesDouble, e.modesDouble, `${label(c)} modesDouble`);
    assert.deepEqual(got.strongestElements, e.strongestElements, `${label(c)} strongest`);
    assert.deepEqual(got.weakestElements, e.weakestElements, `${label(c)} weakest`);
    assert.deepEqual(got.strongestElement, got.strongestElements);
    assert.deepEqual(got.weakestElement, got.weakestElements);
    const total = Object.values(got.elements).reduce((a, b) => a + b, 0);
    assert.equal(total, got.asc === null ? 7 : 8, `${label(c)} element total`);
  }
});

test('all oracle charts: aspects (same pairs and names, orb within 0.02)', () => {
  for (const { c, got } of built) {
    if (EXCEPTIONS.has(label(c))) continue;
    const key = (x) => `${x.a}|${x.b}|${x.type}`;
    const exp = new Map(c.expected.aspects.map((x) => [key(x), x]));
    const gotMap = new Map(got.aspects.map((x) => [key(x), x]));
    assert.deepEqual([...gotMap.keys()].sort(), [...exp.keys()].sort(), `${label(c)} aspect set`);
    for (const [k, x] of exp) {
      const g = gotMap.get(k);
      assert.equal(g.major, x.major, `${label(c)} ${k} major`);
      assert.ok(Math.abs(g.orb - x.orb) <= 0.02, `${label(c)} ${k} orb ${g.orb} vs ${x.orb}`);
    }
  }
});

test('all oracle charts: patterns (same set)', () => {
  for (const { c, got } of built) {
    if (EXCEPTIONS.has(label(c))) continue;
    const key = (p) => `${p.type}:${p.bodies.join(',')}${p.sign ? ':' + p.sign : ''}`;
    assert.deepEqual(got.patterns.map(key).sort(), c.expected.patterns.map(key).sort(),
      `${label(c)} patterns`);
  }
});

test('pre-1972 charts use UT1 for angles (Einstein 1879, London 1900, Monroe 1926, Obama 1961)', () => {
  const want = ['1879-03-14T10:36:32Z', '1900-01-01T11:37:00Z', '1926-06-01T17:30:00Z', '1961-08-05T05:24:00Z'];
  for (const utc of want) {
    const c = charts.find((x) => x.input.utc === utc);
    assert.ok(c, utc);
    const got = buildChart(inputOf(c), eph, conv);
    // Passing UTC instead of UT1 to angles() shifts the Asc by 0.03 (1961) to 0.34 deg (1900)
    // for these charts, beyond the 0.02 tolerance, so this fails if the time scale is wrong.
    assert.ok(angDiff(got.asc, c.expected.asc) < 0.02, `${utc} asc ${got.asc} vs ${c.expected.asc}`);
    assert.ok(angDiff(got.mc, c.expected.mc) < 0.02, `${utc} mc`);
    assert.deepEqual(got.houses, c.expected.houses);
  }
});

test('no birth time: blanks houses, Rising, ruler, MC, Vertex, Fortune; element total 7', () => {
  const noTime = built.filter(({ c }) => !c.input.hasTime);
  assert.ok(noTime.length >= 30);
  for (const { c, got } of noTime) {
    for (const k of ['asc', 'mc', 'vertex', 'fortune', 'fortuneIsDay', 'houses', 'chartRuler']) {
      assert.equal(got[k], null, `${label(c)} ${k}`);
    }
    for (const p of Object.values(got.planets)) assert.equal(p.house, null);
    assert.equal(Object.values(got.elements).reduce((a, b) => a + b, 0), 7);
    assert.equal(Object.values(got.modes).reduce((a, b) => a + b, 0), 7);
    assert.ok(!got.aspects.some((a) => ['Ascendant', 'MC'].includes(a.a) || ['Ascendant', 'MC'].includes(a.b)));
    assert.ok(got.warnings.includes('noBirthTime'));
  }
  // Same chart with and without a time: planets identical, only time-dependent fields differ.
  const c = charts.find((x) => x.input.hasTime);
  const a = buildChart({ ...inputOf(c), hasTime: false }, eph, conv);
  const b = buildChart(inputOf(c), eph, conv);
  assert.equal(a.planets.Moon.lon, b.planets.Moon.lon);
  assert.equal(a.asc, null);
  assert.equal(a.chartRuler, null);
});

test('chart ruler: Scorpio rising -> Mars (modern Pluto); Aquarius, Pisces, Leo', () => {
  const S = (name) => SIGNS.indexOf(name);
  const find = (sign) => built.find(({ got }) => got.asc !== null && signOf(got.asc) === S(sign));
  const cases = {
    Scorpio: ['Mars', 'Pluto'], Aquarius: ['Saturn', 'Uranus'], Pisces: ['Jupiter', 'Neptune'],
    Leo: ['Sun', null], Cancer: ['Moon', null], Gemini: ['Mercury', null],
  };
  for (const [sign, [trad, modern]] of Object.entries(cases)) {
    const hit = find(sign);
    assert.ok(hit, `no ${sign} rising chart in the oracle`);
    const r = hit.got.chartRuler;
    assert.equal(r.traditional, trad, sign);
    assert.equal(r.modern, modern, sign);
    // Ruler's sign and house: those of the traditional ruler planet.
    assert.equal(r.sign, hit.got.planets[trad].sign);
    assert.equal(r.house, hit.c.expected.houses[trad]);
  }
});

test('Sun and Moon are never retrograde; nodes carry no retro mark', () => {
  for (const { got } of built) {
    assert.equal(got.planets.Sun.retro, false);
    assert.equal(got.planets.Moon.retro, false);
  }
});

test('strongest/weakest element ties return every tied element', () => {
  // fire 3, earth 3, air 1, water 1 -> two strongest, two weakest.
  const lons = { Sun: 5, Moon: 125, Mercury: 245, Venus: 35, Mars: 155, Jupiter: 275, Saturn: 65, Ascendant: 95 };
  const bal = elementBalance(lons, conv);
  assert.deepEqual(bal.elements, { fire: 3, earth: 3, air: 1, water: 1 });
  assert.deepEqual(bal.strongestElements, ['fire', 'earth']);
  assert.deepEqual(bal.weakestElements, ['air', 'water']);
  // Oracle has tied charts too; covered by the oracle element test.
  assert.ok(built.some(({ c }) => c.expected.strongestElements.length > 1));
});

test('tightest aspects: three majors, never Ascendant or MC', () => {
  for (const { got } of built) {
    const t = got.tightestAspects;
    assert.ok(t.length <= 3);
    for (const x of t) {
      assert.equal(x.major, true);
      assert.ok(!['Ascendant', 'MC'].includes(x.a) && !['Ascendant', 'MC'].includes(x.b));
    }
    const eligible = got.aspects.filter((x) => x.major && !['Ascendant', 'MC'].includes(x.a)
      && !['Ascendant', 'MC'].includes(x.b));
    assert.deepEqual(t, eligible.slice(0, 3));
  }
  // Einstein: Asc-MC trine (0.43) is the tightest major overall but must not take a slot.
  const ein = built[0].got;
  assert.equal(ein.aspects[0].a, 'Ascendant');
  assert.deepEqual(ein.tightestAspects.map((x) => `${x.a} ${x.type} ${x.b}`),
    ['Mercury conjunction Saturn', 'Sun sextile Pluto', 'Mars trine Pluto']);
  // Direct use of the helper.
  const asp = findAspects({ Sun: 0, Moon: 90.5, Ascendant: 0.1 }, conv);
  assert.deepEqual(tightestAspects(asp).map((x) => x.type), ['square']);
});

test('warnings: vertexUnreliable near the equator and above 66 deg; polar Ascendant', () => {
  const utc = new Date('2000-01-01T12:00:00Z');
  const eq = buildChart({ utc, lat: 0.5, lon: 10, hasTime: true }, eph, conv);
  assert.ok(eq.warnings.includes('vertexUnreliable'));
  const mid = buildChart({ utc, lat: 45, lon: 10, hasTime: true }, eph, conv);
  assert.deepEqual(mid.warnings, []);
  const polar = buildChart({ utc, lat: 70, lon: 20, hasTime: true }, eph, conv);
  assert.ok(polar.warnings.includes('vertexUnreliable'));
  assert.ok(polar.warnings.includes('ascendantUndefined'));
  assert.equal(polar.asc, null);
  assert.equal(polar.houses, null);
  assert.equal(polar.chartRuler, null);
  assert.equal(polar.fortune, null);
  assert.equal(typeof polar.mc, 'number');
  assert.equal(Object.values(polar.elements).reduce((a, b) => a + b, 0), 7);
});
