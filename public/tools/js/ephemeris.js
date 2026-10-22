// Browser ephemeris: Chebyshev tables built from NASA JPL DE440s (+ JPL Chiron SPK)
// by daily-oracle-repo scripts/build_tables.py. No Swiss Ephemeris.
//
// Longitudes are geocentric apparent tropical longitudes (true ecliptic and equinox
// of date: light-time, aberration and nutation included), in degrees 0-360. This is
// the same quantity the Python oracle writes to tools/tests/oracle/charts.json.
// Time argument: Julian date in TT. Use ttFromUtc() / ut1FromUtc() to convert
// (before 1972 the civil time is taken as UT1; see ttFromUtc).

export const BODIES = Object.freeze(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter',
  'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Chiron']);

const DEFAULT_BASE = new URL('../data/', import.meta.url).href;

function chebval(c, off, n, x) {
  // Clenshaw recurrence for sum c_k T_k(x), k = 0..n-1
  let b1 = 0, b2 = 0;
  const x2 = 2 * x;
  for (let k = n - 1; k >= 1; k--) {
    const t = x2 * b1 - b2 + c[off + k];
    b2 = b1;
    b1 = t;
  }
  return x * b1 - b2 + c[off];
}

/** 1972-01-01T00:00:00Z: start of leap-second UTC. Earlier civil time is treated as UT1. */
export const JD_1972 = 2441317.5;

const mod360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => mod360(x + 180) - 180;

/** Mean lunar node, mean equinox of date (Meeus ch. 47). */
export function meanNode(jdTT) {
  const T = (jdTT - 2451545.0) / 36525.0;
  return mod360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T
    + T ** 3 / 467441.0 - T ** 4 / 60616000.0);
}

/** Mean lunar apogee ("Black Moon Lilith"): mean perigee + 180 (Meeus ch. 50). */
export function meanLilith(jdTT) {
  const T = (jdTT - 2451545.0) / 36525.0;
  const perigee = 83.3532465 + 4069.0137287 * T - 0.0103200 * T * T
    - T ** 3 / 80053.0 + T ** 4 / 18999000.0;
  return mod360(perigee + 180.0);
}

class Eph {
  constructor(manifest, coef) {
    this.manifest = manifest;
    this.coef = coef;
    this.range = [manifest.start, manifest.end];
    this.bodies = manifest.bodies;
    this.meanNode = meanNode;
    this.meanLilith = meanLilith;
  }

  /** Longitude only (degrees 0-360) of `body` at TT Julian date `jdTT`. */
  lon(body, jdTT) {
    const b = this.bodies[body];
    if (!b) throw new Error(`unknown body: ${body}`);
    if (!(jdTT >= this.range[0] && jdTT <= this.range[1])) {
      throw new RangeError(`date outside ephemeris range (JD ${jdTT})`);
    }
    const L = b.interval;
    let i = Math.floor((jdTT - this.manifest.start) / L);
    if (i >= b.count) i = b.count - 1;
    const t0 = this.manifest.start + i * L;
    const x = (2 * (jdTT - t0)) / L - 1;
    const n = b.degree + 1;
    return mod360(chebval(this.coef, b.offset + i * n, n, x));
  }

  /**
   * {lon, speed}: longitude in degrees 0-360 and speed in degrees/day.
   * Speed is the change over one day centred on jdTT, as the oracle measures it.
   */
  longitude(body, jdTT) {
    const lon = this.lon(body, jdTT);
    const [a, z] = this.range;
    const lo = Math.max(a, jdTT - 0.5);
    const hi = Math.min(z, jdTT + 0.5);
    const speed = wrap180(this.lon(body, hi) - this.lon(body, lo)) / (hi - lo);
    return { lon, speed };
  }

  /**
   * TT Julian date from a civil-time ("UTC") Julian date.
   * From 1972-01-01 (JD 2441317.5): UTC with leap seconds, TT = UTC + TAI-UTC + 32.184 s.
   * Before 1972: clocks ran on GMT/UT, so civil time is UT1 and TT = UT1 + Delta T.
   * At the 1972 boundary this leaves a step of a fraction of a second (UT1-UTC was
   * about -0.04 s then), far below what a birth time can resolve.
   */
  ttFromUtc(jdUtc) {
    if (jdUtc < JD_1972) {
      const tt0 = jdUtc + this.deltaT(jdUtc) / 86400;
      return jdUtc + this.deltaT(tt0) / 86400;
    }
    const { dates, offsets, before } = this.manifest.leapSeconds;
    let off = before;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (jdUtc >= dates[i]) { off = offsets[i]; break; }
    }
    return jdUtc + (off + 32.184) / 86400;
  }

  /** Delta T = TT - UT1 in seconds at a TT Julian date (linear in the table). */
  deltaT(jdTT) {
    const { start, step, values } = this.manifest.deltaT;
    let f = (jdTT - start) / step;
    f = Math.min(Math.max(f, 0), values.length - 1.000001);
    const i = Math.floor(f);
    return values[i] + (values[i + 1] - values[i]) * (f - i);
  }

  /** UT1 Julian date from a civil-time Julian date (before 1972 civil time is UT1 itself). */
  ut1FromUtc(jdUtc) {
    if (jdUtc < JD_1972) return jdUtc;
    const tt = this.ttFromUtc(jdUtc);
    return tt - this.deltaT(tt) / 86400;
  }
}

let cached = null;

/**
 * Load the tables. Options (for tests): fetch (a fetch-like function) and
 * baseUrl (directory holding manifest.json and the .bin file).
 */
export function loadEphemeris({ fetch: f = globalThis.fetch, baseUrl = DEFAULT_BASE } = {}) {
  const useCache = f === globalThis.fetch && baseUrl === DEFAULT_BASE;
  if (useCache && cached) return cached;
  const p = (async () => {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const res = await f(base + 'manifest.json');
    if (!res.ok) throw new Error(`ephemeris manifest: HTTP ${res.status}`);
    const manifest = await res.json();
    const bin = await f(base + manifest.file);
    if (!bin.ok) throw new Error(`ephemeris data: HTTP ${bin.status}`);
    const coef = new Float32Array(await bin.arrayBuffer()); // little-endian on all browsers in use
    return new Eph(manifest, coef);
  })();
  if (useCache) {
    cached = p;
    p.catch(() => { cached = null; });
  }
  return p;
}
