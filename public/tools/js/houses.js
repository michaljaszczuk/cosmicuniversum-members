// Angles (Ascendant, Midheaven, Vertex) and whole sign houses.
// Exact port of the oracle (daily-oracle-repo src/astrology.py ascendant(),
// gmst_degrees(), mean_obliquity_degrees(); scripts/make_oracle.py _midheaven and
// Vertex = ascendant(90 - lat, lon + 180)). Mean sidereal time and mean obliquity,
// no nutation, on purpose: that is what the oracle does.
// Time argument: Julian date in UT1 (use Eph.ut1FromUtc()).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Wrap into [0, 360), collapsing -0 and the tiny-negative -> 360 edge. */
export function norm360(x) {
  let r = x % 360;
  if (r < 0) r += 360;
  if (r >= 360) r -= 360;
  return r + 0;
}

/** Greenwich Mean Sidereal Time in degrees (Meeus 12.4). */
export function gmst(jdUT) {
  const d = jdUT - 2451545.0;
  const t = d / 36525.0;
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000.0);
}

/** Mean obliquity of the ecliptic in degrees (Meeus 22.2). */
export function meanObliquity(jdUT) {
  const t = (jdUT - 2451545.0) / 36525.0;
  const seconds = 21.448 - 46.8150 * t - 0.00059 * t * t + 0.001813 * t * t * t;
  return 23.0 + 26.0 / 60.0 + seconds / 3600.0;
}

// Ascendant closed form with the oracle's quadrant guard (Asc within 180 deg east of RAMC).
function ascFromRamc(ramc, lat, eps) {
  const r = ramc * D2R, e = eps * D2R, phi = lat * D2R;
  const y = Math.cos(r);
  const x = -(Math.sin(r) * Math.cos(e) + Math.tan(phi) * Math.sin(e));
  let asc = norm360(Math.atan2(y, x) * R2D);
  const d = norm360(asc - ramc);
  if (!(d > 0 && d < 180)) asc = norm360(asc + 180);
  return asc;
}

/**
 * {asc, mc, vertex} in degrees 0-360 for a UT1 Julian date, geographic latitude
 * (north +) and longitude (east +).
 * asc is null inside the polar circles (|lat| >= 90 - obliquity, about 66.56 deg),
 * where the closed form no longer gives a reliable rising point. The oracle's
 * charts stop at 65.95 deg. vertex is the Ascendant formula at the colatitude with
 * the RAMC turned 180 deg; it is defined at every latitude and is null only for
 * non-finite input.
 */
export function angles(jdUT, lat, lon) {
  const eps = meanObliquity(jdUT);
  const ramc = norm360(gmst(jdUT) + lon);
  const r = ramc * D2R;
  const mc = norm360(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(eps * D2R)) * R2D);
  const polar = !(Math.abs(lat) < 90 - eps);
  const asc = polar ? null : ascFromRamc(ramc, lat, eps);
  const vRamc = norm360(gmst(jdUT) + lon + 180);
  let vertex = ascFromRamc(vRamc, 90 - lat, eps);
  if (!Number.isFinite(vertex)) vertex = null;
  return { asc, mc, vertex };
}

/** Whole sign house 1-12 of longitude `lon`; house 1 is the Ascendant's sign. */
export function wholeSignHouse(lon, asc) {
  const s = Math.floor(norm360(lon) / 30);
  const a = Math.floor(norm360(asc) / 30);
  return ((((s - a) % 12) + 12) % 12) + 1;
}
