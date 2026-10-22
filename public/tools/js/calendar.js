// 2027 sky calendar: pure helpers (no DOM, no network). Times come from calendar-2027.json in
// UTC; everything shown to the reader is converted to the chosen IANA zone with Intl, so summer
// time follows that zone's own rules.

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const pad = (n) => String(n).padStart(2, '0');

function parts(t, tz) {
  const p = {};
  for (const x of formatter(tz).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/**
 * UTC instant -> wall clock in zone tz.
 * @param {string} utcIso e.g. '2027-01-07T20:24:00Z'
 * @param {string} tz IANA zone, e.g. 'Pacific/Auckland'
 * @returns {{date:string, time:string, isoLocal:string}} isoLocal carries the zone offset
 */
export function toLocal(utcIso, tz) {
  const t = Date.parse(utcIso);
  if (Number.isNaN(t)) throw new Error(`bad UTC time: ${utcIso}`);
  const p = parts(t, tz);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  const off = Math.round((wall - Math.floor(t / 1000) * 1000) / 60000);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  const time = `${pad(p.h)}:${pad(p.mi)}`;
  return { date, time, isoLocal: `${date}T${time}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}` };
}

/**
 * Group events by month in zone tz. Keys 1..12 are always present; an event that falls in the
 * previous or next year in that zone goes under 0 or 13. Each list is sorted by time.
 * @returns {Map<number, object[]>}
 */
export function eventsByMonth(events, tz, year = 2027) {
  const out = new Map();
  for (let m = 1; m <= 12; m++) out.set(m, []);
  const sorted = [...events].sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
  for (const e of sorted) {
    const [y, m] = toLocal(e.utc, tz).date.split('-').map(Number);
    const k = y < year ? 0 : y > year ? 13 : m;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
  }
  return out;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Short title, e.g. 'New moon', 'Total solar eclipse', 'Mars turns retrograde'. */
export function eventTitle(e) {
  if (e.type === 'new') return 'New moon';
  if (e.type === 'full') return 'Full moon';
  if (e.type === 'eclipse') return cap(e.detail);
  if (e.type === 'station') return `${e.planet} turns ${e.direction}`;
  return cap(e.detail || e.type);
}

/** Position text, e.g. 'Capricorn 17°'. */
export const placeText = (e) => `${e.sign} ${e.deg}°`;

export const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']);
