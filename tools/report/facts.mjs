// Chart facts for the paid report, built with the site's own engine (public/tools/js).
// The report writer gets ONLY this file and library.json. Nothing here is guessed.
// Run: node tools/report/facts.mjs <input.json> <out.json>
// input.json: { name, date: "YYYY-MM-DD", time: "HH:MM", place, lat, lon, tz }
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const js = (f) => import(pathToFileURL(path.join(root, 'public/tools/js', f)).href);
const { loadEphemeris } = await js('ephemeris.js');
const { buildChart } = await js('chart.js');
const { localToUtc } = await js('time.js');
const { worksheetItems, formatDegree, signName, bodyName } = await js('worksheet.js');
const { separation } = await js('aspects.js');
const { wholeSignHouse } = await js('houses.js');
const { findPasses, groupReturns } = await import('./returns.mjs');

const [inFile, outFile] = process.argv.slice(2);
const inp = JSON.parse(await readFile(inFile, 'utf8'));
const dataDir = path.join(root, 'public/tools/data');
async function diskFetch(url) {
  const buf = await readFile(path.join(dataDir, decodeURIComponent(String(url).split('/').pop())));
  return {
    ok: true, status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}
const eph = await loadEphemeris({ fetch: diskFetch, baseUrl: 'disk:/data/' });
const conv = JSON.parse(await readFile(path.join(root, 'tools/config/conventions.json'), 'utf8'));

const [y, m, d] = inp.date.split('-').map(Number);
const [h, mi] = inp.time.split(':').map(Number);
const r = localToUtc({ y, m, d, h, mi }, inp.tz);
if (r.status !== 'ok') throw new Error(`local time is ${r.status}; ask the customer which one`);
const chart = buildChart({ utc: r.utc, lat: inp.lat, lon: inp.lon, hasTime: true, tz: inp.tz }, eph, conv);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const items = worksheetItems(chart, inp.name,
  { date: `${d} ${MONTHS[m - 1]} ${y}`, time: inp.time, place: inp.place }, conv);

// Planets within 5 deg of an angle (ebook page 6).
const ANG = { AC: chart.asc, MC: chart.mc, DC: (chart.asc + 180) % 360, IC: (chart.mc + 180) % 360 };
const nearAngles = [];
for (const [body, p] of Object.entries(chart.planets)) {
  for (const [a, lon] of Object.entries(ANG)) {
    const sep = separation(p.lon, lon);
    if (sep <= 5) nearAngles.push({ body, angle: a, distance: +sep.toFixed(1) });
  }
}

// Which planets sit in which house (planets and Chiron only).
const occupied = {};
for (const [body, p] of Object.entries(chart.planets)) (occupied[p.house] ??= []).push(body);
const emptyHouses = [];
for (let i = 1; i <= 12; i++) if (!occupied[i]) emptyHouses.push(i);

// Dignity from the planet table (ebook page 10), so the writer never looks it up itself.
const lib = JSON.parse(await readFile(path.join(root, 'tools/report/library.json'), 'utf8'));
const dignity = {};
for (const [body, row] of Object.entries(lib.planet)) {
  const s = chart.planets[body].sign;
  dignity[body] = row.home.includes(s) ? 'home' : row.strong.includes(s) ? 'strong'
    : row.challenged.includes(s) ? 'challenged' : 'none';
}

// Saturn returns (about ages 29, 58, 87), computed so the writer never works out a date.
const birthJd = eph.ttFromUtc(r.utc.getTime() / 86400000 + 2440587.5);
const todayJd = Date.now() / 86400000 + 2440587.5;
const saturnReturns = groupReturns(findPasses(eph, 'Saturn', chart.planets.Saturn.lon,
  birthJd + 20 * 365.25, birthJd + 95 * 365.25), birthJd, todayJd);

const facts = {
  _about: 'Chart facts from the cosmic_universum chart engine. Every value is computed. Do not change or add any value.',
  input: { ...inp, utc: r.utc.toISOString(), utcOffsetHours: (Date.UTC(y, m - 1, d, h, mi) - r.utc.getTime()) / 3600000 },
  method: {
    zodiac: conv.zodiac, houses: conv.houses, positions: conv.positions, node: conv.node, lilith: conv.lilith,
    ephemeris: 'JPL DE440s', engine: 'cosmicuniversum.com/tools',
  },
  items,
  ascendant: `${formatDegree(chart.asc)} ${signName(chart.asc)}`,
  midheaven: `${formatDegree(chart.mc)} ${signName(chart.mc)}`,
  // The worksheet always prints 10; in Whole Sign the MC sign can be house 9, 10 or 11.
  midheavenWholeSignHouse: wholeSignHouse(chart.mc, chart.asc),
  descendant: `${formatDegree(ANG.DC)} ${signName(ANG.DC)}`,
  ic: `${formatDegree(ANG.IC)} ${signName(ANG.IC)}`,
  chartRuler: chart.chartRuler,
  dignity,
  retrograde: Object.entries(chart.planets).filter(([b, p]) => p.retro && !conv.bodies.noRetroMark.includes(b)).map(([b]) => b),
  nearAngles,
  occupiedHouses: occupied,
  emptyHouses,
  patterns: chart.patterns,
  aspects: chart.aspects.map((a) => ({ a: bodyName(a.a), type: a.type, b: bodyName(a.b), orb: +a.orb.toFixed(1) })),
  lons: Object.fromEntries([...Object.entries(chart.planets).map(([b, p]) => [b, p.lon]),
    ['Ascendant', chart.asc], ['MC', chart.mc], ['NorthNode', chart.node], ['SouthNode', chart.southNode],
    ['Lilith', chart.lilith], ['Fortune', chart.fortune], ['Vertex', chart.vertex]]),
  saturnReturns,
  warnings: chart.warnings,
};
await writeFile(outFile, JSON.stringify(facts, null, 2));
console.log('facts written:', outFile, r.utc.toISOString());
