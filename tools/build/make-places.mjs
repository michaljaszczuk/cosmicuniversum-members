// Usage: node tools/build/make-places.mjs path/to/cities500.txt path/to/admin1CodesASCII.txt <outDir>
// Source: GeoNames cities500 and admin1 codes (CC BY 4.0), https://download.geonames.org/export/dump/
// Output: <outDir>/<key>.json, one file per first 2 folded letters (see placeKey), so the order form
// can search small towns without sending what the customer types anywhere.
//   { v:1, tzs:[tz names], rows:[[name, country, admin1, lat, lon, tzIndex, pop, aliases?], ...] }
// A town is in the file of its name and in the file of each kept alias. Rows sorted by pop, descending.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { foldText } from '../../public/tools/js/places.js';
import { placeKey } from '../../public/report/js/places.js';

const ALIAS_MIN_POP = 100000;

function aliasesOf(f, pop) {
  const own = new Set([foldText(f[1])]);
  const keep = [];
  const ascii = foldText(f[2]);
  if (!own.has(ascii)) { keep.push(ascii); own.add(ascii); }
  if (pop >= ALIAS_MIN_POP) {
    for (const al of f[3].split(',')) {
      const x = foldText(al);
      if (/^[a-z][a-z .'-]{3,}$/.test(x) && (x.match(/[aeiouy]/g) || []).length >= 2 && !own.has(x)) {
        own.add(x);
        keep.push(x);
      }
    }
  }
  return keep;
}

/** @param {string[]} lines cities500 lines @param {Map<string,string>} admin1 'PL.78' -> 'Masovia' */
export function buildIndex(lines, admin1 = new Map()) {
  const towns = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    const pop = +f[14] || 0;
    towns.push({
      row: [f[1], f[8], admin1.get(`${f[8]}.${f[10]}`) || '', +(+f[4]).toFixed(3), +(+f[5]).toFixed(3), f[17], pop],
      aliases: aliasesOf(f, pop),
      name: foldText(f[1]),
    });
  }
  towns.sort((a, b) => b.row[6] - a.row[6]);
  const files = new Map();
  for (const t of towns) {
    const keys = new Set([t.name, ...t.aliases].map(placeKey).filter(Boolean));
    for (const k of keys) {
      let file = files.get(k);
      if (!file) { file = { v: 1, tzs: [], rows: [], tzIdx: new Map() }; files.set(k, file); }
      const tz = t.row[5];
      if (!file.tzIdx.has(tz)) { file.tzIdx.set(tz, file.tzs.length); file.tzs.push(tz); }
      const r = [...t.row];
      r[5] = file.tzIdx.get(tz);
      if (t.aliases.length) r.push(t.aliases.join('|'));
      file.rows.push(r);
    }
  }
  for (const file of files.values()) delete file.tzIdx;
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src, adminSrc, outDir] = process.argv.slice(2);
  if (!outDir) { console.error('usage: make-places.mjs cities500.txt admin1CodesASCII.txt outDir'); process.exit(1); }
  const admin1 = new Map();
  for (const line of readFileSync(adminSrc, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length > 1) admin1.set(f[0], f[1]);
  }
  const files = buildIndex(readFileSync(src, 'utf8').split('\n'), admin1);
  mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const [k, file] of files) {
    const s = JSON.stringify(file);
    bytes += s.length;
    writeFileSync(`${outDir}/${k}.json`, s);
  }
  console.log(`wrote ${files.size} files, ${(bytes / 1e6).toFixed(1)} MB to ${outDir}`);
}
