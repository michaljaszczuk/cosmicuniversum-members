// Worksheet PDFs (pdf.js + worksheet.js) and form input checks (input.js).
// Run: node --test tools/tests/pdf.test.mjs
// The template PDFs are git-ignored (built by tools/ebook/build_v2.py and copied by
// tools/build/copy-assets.mjs). Without them the PDF tests skip with a message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { PDFDocument, PDFTextField } from '../../public/tools/vendor/pdf-lib/pdf-lib.esm.min.js';
import { loadEphemeris } from '../../public/tools/js/ephemeris.js';
import { buildChart } from '../../public/tools/js/chart.js';
import { fillEditable, renderPrint } from '../../public/tools/js/pdf.js';
import { worksheetValues, formatDegree } from '../../public/tools/js/worksheet.js';
import { checkDate, checkTime } from '../../public/tools/js/input.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dataDir = path.join(root, 'public', 'tools', 'data');
const jsDir = path.join(root, 'public', 'tools', 'js');
const charts = JSON.parse(await readFile(path.join(here, 'oracle', 'charts.json'), 'utf8'));
const conv = JSON.parse(await readFile(path.join(root, 'tools', 'config', 'conventions.json'), 'utf8'));
const fieldMap = JSON.parse(await readFile(path.join(root, 'tools', 'ebook', 'field-map.json'), 'utf8'));

const EDIT = path.join(dataDir, 'ebook-pages-16-18-edit.pdf');
const PRINT = path.join(dataDir, 'ebook-pages-16-18-print.pdf');
const haveTemplates = existsSync(EDIT) && existsSync(PRINT);
const SKIP = haveTemplates ? false
  : 'template PDFs missing: build them (tools/ebook/build_v2.py), then run node tools/build/copy-assets.mjs';

async function diskFetch(url) {
  const name = decodeURIComponent(String(url).split('/').pop());
  const buf = await readFile(path.join(dataDir, name));
  return {
    ok: true, status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}
// pdf.js asks for files by a path relative to itself (public/tools/js/).
const load = async (rel) => new Uint8Array(await readFile(path.resolve(jsDir, rel)));

const eph = await loadEphemeris({ fetch: diskFetch, baseUrl: 'disk:/data/' });
const inputOf = (i) => ({ utc: new Date(i.utc), lat: i.lat, lon: i.lon, hasTime: i.hasTime, tz: i.tz });

const einsteinCase = charts[0];
assert.equal(einsteinCase.input.name, 'Albert Einstein');
const einstein = buildChart(inputOf(einsteinCase.input), eph, conv);
const birth = { date: '14 March 1879', time: '11:30', place: 'Ulm, Germany' };

const noTimeCase = charts.find((c) => !c.input.hasTime);
const noTime = buildChart(inputOf(noTimeCase.input), eph, conv);

const all = (page) => Object.entries(fieldMap[page]);
const mapped = [...all('page16'), ...all('page17'), ...all('page18')];
const F = Object.fromEntries(mapped);
const writingFields = Object.entries(fieldMap._meta.writingOnly)
  .flatMap(([page, items]) => items.map((k) => fieldMap[page][k]));

async function readFields(bytes) {
  const doc = await PDFDocument.load(bytes);
  const out = {};
  for (const f of doc.getForm().getFields()) {
    if (f instanceof PDFTextField) out[f.getName()] = f.getText() ?? '';
  }
  return { doc, out };
}

// ------------------------------------------------------------------ pure parts

test('formatDegree: whole degree inside the sign, like the ebook (12°)', () => {
  assert.equal(formatDegree(353.498953), '23°');
  assert.equal(formatDegree(30), '0°');
  assert.equal(formatDegree(29.999), '29°');
});

test('worksheetValues: Einstein data fields', () => {
  const v = worksheetValues(einstein, 'Albert', birth, conv, fieldMap);
  const e = einsteinCase.expected;
  assert.equal(v[F['sun.sign']], 'Pisces');
  assert.equal(v[F['sun.degree']], '23°');
  assert.equal(v[F['sun.house']], String(e.houses.Sun));
  assert.equal(v[F['uranus.retro']], '℞');
  assert.equal(v[F['sun.retro']], '');
  assert.equal(v[F['midheaven.house']], '10');
  assert.equal(v[F['bigThree.rising']], 'Cancer');
  assert.equal(v[F.chartRuler], 'Moon');
  assert.equal(v[F['chartRuler.signHouse']], `${einstein.planets.Moon.sign}, house ${e.houses.Moon}`);
  assert.equal(v[F.name], 'Albert');
  assert.equal(v[F.birthPlace], 'Ulm, Germany');
  assert.equal(v[F.patterns], 'Stellium in Aries (Mercury, Venus, Saturn)');
  for (const w of writingFields) assert.ok(!(w in v) || v[w] === '', `writing field ${w} must stay empty`);
});

test('checkDate: real calendar dates from 1900-01-01 to 2100-12-31 only', () => {
  assert.equal(checkDate('1879-03-14').ok, false); // outside range
  assert.match(checkDate('1879-03-14').error, /1900/);
  assert.equal(checkDate('1900-01-01').ok, true);
  assert.equal(checkDate('2100-12-31').ok, true);
  assert.equal(checkDate('2101-01-01').ok, false);
  assert.equal(checkDate('2023-02-29').ok, false);
  assert.equal(checkDate('2024-02-29').ok, true);
  assert.equal(checkDate('1990-13-01').ok, false);
  assert.equal(checkDate('').ok, false);
  assert.deepEqual(checkDate('1990-07-04').value, { y: 1990, m: 7, d: 4 });
});

test('checkTime: HH:MM, 00:00 to 23:59', () => {
  assert.deepEqual(checkTime('11:30').value, { h: 11, mi: 30 });
  assert.equal(checkTime('24:00').ok, false);
  assert.equal(checkTime('').ok, false);
});

// ------------------------------------------------------------------ PDFs

test('field map has no dangling names: every mapped field is in the edit template', { skip: SKIP }, async () => {
  const doc = await PDFDocument.load(await readFile(EDIT));
  const names = new Set(doc.getForm().getFields().map((f) => f.getName()));
  for (const [item, name] of mapped) assert.ok(names.has(name), `${item} -> ${name} not in template`);
});

test('fillEditable: values read back from the fields', { skip: SKIP }, async () => {
  const bytes = await fillEditable(einstein, 'Albert', { birth, load });
  const { doc, out } = await readFields(bytes);
  const e = einsteinCase.expected;
  assert.equal(doc.getPageCount(), 3);
  assert.equal(out[F['sun.sign']], 'Pisces');
  assert.equal(out[F['sun.degree']], '23°');
  assert.equal(out[F['sun.house']], String(e.houses.Sun));
  assert.equal(out[F['northNode.sign']], 'Aquarius');
  assert.equal(out[F['northNode.degree']], formatDegree(e.node));
  assert.equal(out[F['northNode.house']], String(e.houses.NorthNode));
  assert.equal(out[F['northNode.retro']], '');
  assert.equal(out[F['chiron.sign']], 'Taurus');
  assert.equal(out[F['chiron.degree']], formatDegree(e.planets.Chiron.lon));
  assert.equal(out[F['chiron.house']], String(e.houses.Chiron));
  assert.equal(out[F['uranus.retro']], '℞');
  assert.equal(out[F['midheaven.house']], '10');
  assert.equal(out[F['midheaven.sign']], 'Pisces');
  for (const k of ['fire', 'earth', 'air', 'water']) assert.equal(out[F[`balance.${k}`]], String(e.elements[k]), k);
  for (const k of ['cardinal', 'fixed', 'mutable']) assert.equal(out[F[`balance.${k}`]], String(e.modes[k]), k);
  assert.equal(out[F.strongestElement], 'Fire');
  assert.equal(out[F.moonPhase], 'Disseminating');
  assert.equal(out[F['aspect1.planetA']], 'Mercury');
  assert.equal(out[F['aspect1.aspect']], 'Conjunction');
  assert.equal(out[F['aspect1.planetB']], 'Saturn');
  assert.equal(out[F['aspect1.orb']], '1.1°');
  assert.equal(out[F.birthDate], '14 March 1879');
  assert.equal(out[F.name], 'Albert');
  for (const w of writingFields) assert.equal(out[w], '', `writing field ${w} must be empty`);
  // all fields stay editable
  for (const f of doc.getForm().getFields()) assert.equal(f.isReadOnly(), false, `${f.getName()} read-only`);
  assert.equal(doc.getForm().getFields().length, 120);
});

test('fillEditable: no birth time blanks houses, Rising, ruler, Midheaven, Vertex, Fortune', { skip: SKIP }, async () => {
  const { out } = await readFields(await fillEditable(noTime, '', { birth: { date: '24 November 2048', time: '', place: 'Sydney, Australia' }, load }));
  const blank = ['bigThree.rising', 'sun.house', 'moon.house', 'northNode.house', 'chiron.house',
    'midheaven.sign', 'midheaven.degree', 'midheaven.house', 'chartRuler', 'chartRuler.signHouse',
    'southNode.house', 'lilith.house', 'partOfFortune.sign', 'partOfFortune.degree', 'partOfFortune.house',
    'vertex.sign', 'vertex.degree', 'vertex.house', 'name'];
  for (const k of blank) assert.equal(out[F[k]], '', `${k} must be blank`);
  assert.notEqual(out[F['sun.sign']], '');
  assert.notEqual(out[F['southNode.sign']], '');
  const sum = ['fire', 'earth', 'air', 'water'].reduce((s, k) => s + Number(out[F[`balance.${k}`]]), 0);
  assert.equal(sum, 7);
});

test('renderPrint: three pages, zero form fields', { skip: SKIP }, async () => {
  const bytes = await renderPrint(einstein, 'Albert', { birth, load });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 3);
  assert.equal(doc.getForm().getFields().length, 0);
  const noTimeBytes = await renderPrint(noTime, '', { birth: { date: '24 November 2048', time: '', place: 'Sydney' }, load });
  assert.equal((await PDFDocument.load(noTimeBytes)).getForm().getFields().length, 0);
});

test('browser copies of conventions.json and field-map.json match the sources', async () => {
  for (const [src, dst] of [['tools/config/conventions.json', 'conventions.json'], ['tools/ebook/field-map.json', 'field-map.json']]) {
    const a = await readFile(path.join(root, src), 'utf8');
    const b = await readFile(path.join(dataDir, dst), 'utf8');
    assert.equal(b, a, `${dst} is stale: run node tools/build/copy-assets.mjs`);
  }
});
