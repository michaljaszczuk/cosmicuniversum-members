import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchCities, loadCities, isLoaded, foldText } from '../../public/tools/js/places.js';

const data = readFileSync(new URL('../../public/tools/data/cities.json', import.meta.url));
const fakeFetch = async () => ({ ok: true, json: async () => JSON.parse(data.toString('utf8')) });
assert.equal(isLoaded(), false);
await loadCities({ fetch: fakeFetch });
const raw = JSON.parse(data.toString('utf8'));
const popOf = (c) => raw.rows.find((r) => r[0] === c.name && r[2] === c.lat && r[3] === c.lon)[5];

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
  assert.ok(r.every((c) => {
    const row = raw.rows.find((x) => x[0] === c.name && x[2] === c.lat && x[3] === c.lon);
    return foldText(row[0]).startsWith('san') || (row[6] || '').split('|').some((a) => a.startsWith('san'));
  }));
  const pops = r.map(popOf);
  assert.deepEqual(pops, [...pops].sort((a, b) => b - a));
});

test('empty query', () => assert.deepEqual(searchCities(''), []));

test('isLoaded', () => assert.equal(isLoaded(), true));

test('fold handles letters NFD does not decompose', () => {
  assert.equal(searchCities('Wroclaw')[0].name, 'Wrocław');
  assert.equal(searchCities('Lodz')[0].name, 'Łódź');
  assert.equal(searchCities('łódź')[0].name, 'Łódź');
});

test('exonym aliases for large cities', () => {
  for (const q of ['Firenze', 'Nurnberg', 'Torino']) assert.ok(searchCities(q).length >= 1, q);
});

test('common exonyms resolve to the expected city within first 3 results', () => {
  const cases = [['Wien', 'Vienna'], ['Munchen', 'Munich'], ['Muenchen', 'Munich'], ['Praha', 'Prague'],
    ['Krakow', 'Kraków'], ['Koln', 'Köln'], ['Warszawa', 'Warsaw'], ['Firenze', 'Florence'],
    ['Torino', 'Turin'], ['Nurnberg', 'Nuremberg']];
  for (const [q, want] of cases) {
    const names = searchCities(q).slice(0, 3).map((c) => c.name);
    assert.ok(names.some((n) => foldText(n) === foldText(want) || n === want), `${q} -> ${names}`);
  }
});
