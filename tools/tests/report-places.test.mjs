import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../build/make-places.mjs';
import { placeKey, searchPlaces, findPlace } from '../../public/report/js/places.js';

// Made-up towns in GeoNames column layout (id, name, ascii, alternates, lat, lon, class, code,
// country, cc2, admin1, admin2, admin3, admin4, pop, elevation, dem, tz, date).
const row = (name, ascii, alts, lat, lon, cc, a1, pop, tz) =>
  ['1', name, ascii, alts, lat, lon, 'P', 'PPL', cc, '', a1, '', '', '', String(pop), '', '0', tz, '2024-01-01'].join('\t');
const lines = [
  row('Ząbki', 'Zabki', '', '52.29', '21.11', 'PL', '78', 900, 'Europe/Warsaw'),
  row('Warsaw', 'Warsaw', 'Warszawa,Varsovie', '52.2298', '21.0118', 'PL', '78', 1700000, 'Europe/Warsaw'),
  row('Łódź', 'Lodz', '', '51.75', '19.46', 'PL', '74', 670000, 'Europe/Warsaw'),
  row('1st Town', '1st Town', '', '10', '10', 'XX', '01', 600, 'UTC'),
  ...Array.from({ length: 12 }, (_, i) =>
    row(`Sando${i}`, `Sando${i}`, '', String(40 + i), '5', 'ES', '01', 1000 + i * 10, 'Europe/Madrid')),
];
const admin1 = new Map([['PL.78', 'Masovia'], ['PL.74', 'Łódź Voivodeship']]);
const files = buildIndex(lines, admin1);
const fakeFetch = async (url) => {
  const key = String(url).split('/').pop().replace('.json', '');
  const f = files.get(key);
  return f ? { ok: true, json: async () => JSON.parse(JSON.stringify(f)) } : { ok: false, status: 404 };
};
const opts = { fetch: fakeFetch, base: '/report/places/' };

test('small town found by prefix, folded', async () => {
  const r = await searchPlaces('zabk', opts);
  assert.equal(r[0].name, 'Ząbki');
  assert.equal(r[0].tz, 'Europe/Warsaw');
  assert.equal(r[0].admin1, 'Masovia');
});

test('alias finds the town', async () => {
  const r = await searchPlaces('Warszawa', opts);
  assert.equal(r[0].name, 'Warsaw');
});

test('max 10, sorted by population', async () => {
  const r = await searchPlaces('sando', opts);
  assert.equal(r.length, 10);
  assert.equal(r[0].name, 'Sando11');
  assert.deepEqual(r.map((x) => x.name), [...Array(10)].map((_, i) => `Sando${11 - i}`));
});

test('one-letter query returns []', async () => {
  assert.deepEqual(await searchPlaces('z', opts), []);
});

test('unknown prefix returns []', async () => {
  assert.deepEqual(await searchPlaces('qq', opts), []);
});

test('findPlace exact match and miss', async () => {
  const hit = await findPlace({ name: 'Ząbki', country: 'PL', lat: 52.29, lon: 21.11 }, opts);
  assert.equal(hit.tz, 'Europe/Warsaw');
  assert.equal(await findPlace({ name: 'Ząbki', country: 'PL', lat: 52.291, lon: 21.11 }, opts), null);
  assert.equal(await findPlace({ name: 'Ząbki', country: 'DE', lat: 52.29, lon: 21.11 }, opts), null);
});

test('placeKey', () => {
  assert.equal(placeKey('Łódź'), 'lo');
  assert.equal(placeKey('1st'), '_');
  assert.equal(placeKey('z'), '');
});
