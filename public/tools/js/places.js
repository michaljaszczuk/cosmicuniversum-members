// City search over GeoNames cities15000 (CC BY 4.0). Data is the site's own static file,
// fetched lazily; nothing a user types leaves the browser.

// Built on first use, not at load: the report shop's server code imports foldText from here,
// and import.meta.url is not a URL there.
const defaultUrl = () => new URL('../data/cities.json', import.meta.url).href;
let cities = null; // [{name,country,lat,lon,tz,pop,key,aliases}] sorted by pop desc
let pending = null;

const EXTRA = { 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ı': 'i', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ð': 'd' };
export const foldText = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[łøđıßæœþð]/g, (c) => EXTRA[c]).trim();

export const isLoaded = () => cities !== null;

export function loadCities({ fetch: f = globalThis.fetch, url = defaultUrl() } = {}) {
  if (cities) return Promise.resolve(cities);
  if (!pending) {
    pending = (async () => {
      const res = await f(url);
      if (!res.ok) throw new Error(`cities: HTTP ${res.status}`);
      const j = await res.json();
      cities = j.rows.map((r) => ({
        name: r[0], country: r[1], lat: r[2], lon: r[3], tz: j.tzs[r[4]], pop: r[5],
        key: foldText(r[0]), aliases: r[6] ? r[6].split('|') : [],
      }));
      cities.sort((a, b) => b.pop - a.pop);
      return cities;
    })().catch((e) => { pending = null; throw e; });
  }
  return pending;
}

/** Prefix search (diacritics folded). Call after loadCities() resolves. Max 10, by population. */
export function searchCities(q) {
  const s = foldText(q || '');
  if (!s || !cities) return [];
  const out = [];
  for (const c of cities) {
    if (c.key.startsWith(s) || c.aliases.some((a) => a.startsWith(s))) {
      out.push({ name: c.name, country: c.country, lat: c.lat, lon: c.lon, tz: c.tz });
      if (out.length === 10) break;
    }
  }
  return out;
}
