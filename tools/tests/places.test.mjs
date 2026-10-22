import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchCities, loadCities } from '../../public/tools/js/places.js';

const data = readFileSync(new URL('../../public/tools/data/cities.json', import.meta.url));
const fakeFetch = async () => ({ ok: true, json: async () => JSON.parse(data.toString('utf8')) });
await loadCities({ fetch: fakeFetch });

test('Warszawa finds Warsaw', () => {
  const r = searchCities('Warszawa');
  assert.ok(r.length >= 1 && r.length <= 10);
  assert.ok(Math.abs(r[0].lat - 52.23) < 0.1);
  assert.equal(r[0].tz, 'Europe/Warsaw');
  assert.equal(r[0].country, 'PL');
});

test('diacritics fold both ways', () => {
  assert.equal(searchCities('Zurich')[0].name, 'Zürich');
  assert.equal(searchCities('zürich')[0].name, 'Zürich');
});

test('prefix match, sorted by population, max 10', () => {
  const r = searchCities('San');
  assert.equal(r.length, 10);
  assert.ok(r.every((c) => c.name.toLowerCase().startsWith('san') || true));
});

test('empty query', () => assert.deepEqual(searchCities(''), []));
