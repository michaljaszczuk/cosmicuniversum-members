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
