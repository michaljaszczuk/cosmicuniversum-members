// Usage: node tools/build/make-cities.mjs path/to/cities15000.txt
// Source: GeoNames cities15000 (CC BY 4.0), https://download.geonames.org/export/dump/cities15000.zip
// Output: public/tools/data/cities.json
//   { v:1, cols, tzs:[tz names], rows:[[name, country, lat, lon, tzIndex, pop, aliases?], ...] }
// aliases: space-free-joined folded Latin alternate names ("|" separated), only for larger cities,
// so that e.g. "Warszawa" finds Warsaw.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ALIAS_MIN_POP = 100000;
const BIG_POP = 1000000;
const ALIAS_MAX = 6;
const EXTRA = { 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ı': 'i', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ð': 'd' };
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[łøđıßæœþð]/g, (c) => EXTRA[c]);

const src = process.argv[2];
if (!src) { console.error('usage: make-cities.mjs cities15000.txt'); process.exit(1); }
const rows = [];
const tzs = [];
const tzIdx = new Map();
for (const line of readFileSync(src, 'utf8').split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  const name = f[1], pop = +f[14];
  const own = new Set([fold(name)]);
  let aliases = '';
  if (pop >= ALIAS_MIN_POP) {
    const ascii = fold(f[2]);
    own.add(ascii);
    const set = new Set();
    for (const al of f[3].split(',')) {
      const x = fold(al);
      if (/^[a-z][a-z .'-]{3,}$/.test(x) && (x.match(/[aeiouy]/g) || []).length >= 2 && !own.has(x)) set.add(x);
    }
    const all = [...set];
    // an alias that is a prefix of another candidate is redundant for prefix search
    const maximal = all.filter((x) => !all.some((y) => y !== x && y.startsWith(x)));
    // pop >= 1M: keep every alias that passed the junk filter. Smaller: asciiname + shortest few.
    const keep = pop >= BIG_POP ? maximal : maximal.sort((x, y) => x.length - y.length).slice(0, ALIAS_MAX);
    if (ascii !== fold(name)) keep.unshift(ascii); // GeoNames asciiname always kept
    aliases = keep.join('|');
  }
  if (!tzIdx.has(f[17])) { tzIdx.set(f[17], tzs.length); tzs.push(f[17]); }
  const row = [name, f[8], +(+f[4]).toFixed(3), +(+f[5]).toFixed(3), tzIdx.get(f[17]), pop];
  if (aliases) row.push(aliases);
  rows.push(row);
}
rows.sort((a, b) => b[5] - a[5]);
const out = fileURLToPath(new URL('../../public/tools/data/cities.json', import.meta.url));
writeFileSync(out, JSON.stringify({ v: 1, cols: ['name', 'country', 'lat', 'lon', 'tzIndex', 'pop', 'aliases?'], tzs, rows }));
console.log(`wrote ${rows.length} cities to ${out}`);
