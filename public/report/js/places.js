// Town search for the report order form over GeoNames cities500 (CC BY 4.0).
// The data is the site's own static files (public/report/places/<key>.json, made by
// tools/build/make-places.mjs); nothing the customer types leaves our site.
import { foldText } from '../../tools/js/places.js';

const DEFAULT_BASE = '/report/places/';
const caches = new WeakMap(); // fetch function -> Map(url -> Promise<file|null>)

/** File key of a name or query: its first 2 folded letters, '_' if they are not a-z, '' if too short. */
export function placeKey(q) {
  const s = foldText(q || '');
  if (s.length < 2) return '';
  return /^[a-z]{2}/.test(s) ? s.slice(0, 2) : '_';
}

function loadFile(key, { fetch: f = globalThis.fetch, base = DEFAULT_BASE } = {}) {
  if (!caches.has(f)) caches.set(f, new Map());
  const cache = caches.get(f);
  const url = `${base}${key}.json`;
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const res = await f(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`places: HTTP ${res.status}`);
      return res.json();
    })().catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}

const toPlace = (file, r) => ({ name: r[0], country: r[1], admin1: r[2], lat: r[3], lon: r[4], tz: file.tzs[r[5]] });

/** Prefix search (diacritics folded), max 10, by population. Needs at least 2 letters. */
export async function searchPlaces(q, opts) {
  const key = placeKey(q);
  if (!key) return [];
  const file = await loadFile(key, opts);
  if (!file) return [];
  const s = foldText(q);
  const out = [];
  for (const r of file.rows) {
    if (foldText(r[0]).startsWith(s) || (r[7] || '').split('|').some((a) => a && a.startsWith(s))) {
      out.push(toPlace(file, r));
      if (out.length === 10) break;
    }
  }
  return out;
}

/** The town with exactly this name, country, lat and lon, or null. Used by the server check. */
export async function findPlace({ name, country, lat, lon }, opts) {
  const key = placeKey(name);
  if (!key) return null;
  const file = await loadFile(key, opts);
  if (!file) return null;
  const r = file.rows.find((x) => x[0] === name && x[1] === country && x[3] === lat && x[4] === lon);
  return r ? toPlace(file, r) : null;
}
