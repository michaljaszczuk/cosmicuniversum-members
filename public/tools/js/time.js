// Local civil time -> UTC using Intl.DateTimeFormat zone offsets only (no library, no network).

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', era: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Zone offset (ms, east positive) in effect at UTC instant t (ms). */
function offsetAt(tz, t) {
  const s = Math.floor(t / 1000) * 1000;
  const p = {};
  for (const x of formatter(tz).formatToParts(new Date(s))) p[x.type] = x.value;
  const year = p.era === 'B' ? 1 - +p.year : +p.year;
  const asUtc = Date.UTC(2000, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const d = new Date(asUtc);
  d.setUTCFullYear(year); // Date.UTC maps years 0-99 to 19xx; set explicitly
  return d.getTime() - s;
}

function wallMs({ y, m, d, h, mi }) {
  const dt = new Date(Date.UTC(2000, m - 1, d, h, mi, 0));
  dt.setUTCFullYear(y);
  return dt.getTime();
}

/**
 * @param {{y:number,m:number,d:number,h:number,mi:number}} local wall-clock time
 * @param {string} tz IANA zone
 * @returns {{status:'ok'|'ambiguous'|'missing', utc?:Date, options?:Date[]}}
 */
export function localToUtc(local, tz) {
  const L = wallMs(local);
  const DAY = 86400000;
  const cands = new Set([offsetAt(tz, L - DAY), offsetAt(tz, L + DAY), offsetAt(tz, L)]);
  const hits = [];
  for (const o of cands) {
    const t = L - o;
    if (offsetAt(tz, t) === o) hits.push(t);
  }
  hits.sort((a, b) => a - b);
  if (hits.length === 0) return { status: 'missing' };
  if (hits.length === 1) return { status: 'ok', utc: new Date(hits[0]) };
  return { status: 'ambiguous', options: hits.map((t) => new Date(t)) };
}

/** Hand-typed UTC offset in minutes (east positive, e.g. +330 for India). */
export function manualOffsetToUtc(local, offsetMinutes) {
  return new Date(wallMs(local) - offsetMinutes * 60000);
}

/** Julian Day (UT) of a Date. */
export function jdFromDate(d) {
  return d.getTime() / 86400000 + 2440587.5;
}
