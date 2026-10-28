// Birth time safety window for the report shop: how far the birth time can move (up to 3 hours
// each way, 1-minute steps) before the Rising, Moon or Midheaven sign changes.
// Used by the order form (browser) and by tools/report/facts.mjs (VPS).
import { angles } from './houses.js';
import { signOf } from './chart.js';
import { jdFromDate } from './time.js';

const MIN = 60000;
const RANGE = 180; // minutes each way

function signsAt(ms, lat, lon, eph) {
  const jd = jdFromDate(new Date(ms));
  const a = angles(eph.ut1FromUtc(jd), lat, lon);
  if (a.asc === null) return null;
  return { Rising: signOf(a.asc), Moon: signOf(eph.longitude('Moon', eph.ttFromUtc(jd)).lon), Midheaven: signOf(a.mc) };
}

const changed = (a, b) => ['Rising', 'Moon', 'Midheaven'].find((k) => a[k] !== b[k]);

/**
 * @param {{utc: Date, lat: number, lon: number}} p birth instant and place
 * @returns {null | {rising, moon, mc, from: Date, to: Date, fromCause, toCause}} causes are
 *   'Rising' | 'Moon' | 'Midheaven' (the first sign that changes just outside) or 'edge'
 *   (still the same 3 hours away). null when there is no Rising sign (polar latitude).
 */
export function timeWindow({ utc, lat, lon }, eph) {
  const t0 = utc.getTime();
  const here = signsAt(t0, lat, lon, eph);
  if (!here) return null;
  const walk = (dir) => {
    for (let i = 1; i <= RANGE; i++) {
      const s = signsAt(t0 + dir * i * MIN, lat, lon, eph);
      const cause = s ? changed(here, s) : 'Rising';
      if (cause) return { at: new Date(t0 + dir * (i - 1) * MIN), cause };
    }
    return { at: new Date(t0 + dir * RANGE * MIN), cause: 'edge' };
  };
  const back = walk(-1), fwd = walk(1);
  return {
    rising: here.Rising, moon: here.Moon, mc: here.Midheaven,
    from: back.at, to: fwd.at, fromCause: back.cause, toCause: fwd.cause,
  };
}

/** True when the whole range utc ± sureMinutes stays inside the window. */
export function fitsWindow(w, utc, sureMinutes) {
  const t = utc.getTime(), s = sureMinutes * MIN;
  return t - s >= w.from.getTime() && t + s <= w.to.getTime();
}

/** Local clock time in `tz`, e.g. '06:42', '23:10 the day before', '00:20 the next day'. */
export function clockText(d, tz, birthDate) {
  const p = {};
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  const day = `${p.year}-${p.month}-${p.day}`;
  const clock = `${p.hour}:${p.minute}`;
  if (day < birthDate) return `${clock} the day before`;
  if (day > birthDate) return `${clock} the next day`;
  return clock;
}
