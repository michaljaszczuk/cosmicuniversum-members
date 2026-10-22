// Aspects (ebook page 12). Same rules as the oracle (daily-oracle-repo
// scripts/make_oracle.py _aspects): every pair of conv.aspects.bodies present in
// `lons`, in that order; orb limit is the range's max when the Sun or Moon is one of
// the two bodies, otherwise its min; inclusive edge (orb <= limit).

const ANGLES = new Set(['Ascendant', 'MC']);

/** Angular separation 0-180. */
export function separation(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Orb limit for an aspect spec {angle, min, max} between bodies a and b. */
export function orbLimit(spec, a, b) {
  const lum = a === 'Sun' || a === 'Moon' || b === 'Sun' || b === 'Moon';
  return lum ? spec.max : spec.min;
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

/**
 * @param {Object<string, number|null>} lons longitudes by body name (null/missing skipped)
 * @param {object} conv conventions.json
 * @returns {{a, b, type, major, orb}[]} sorted by orb (rounded to 4 decimals), then a, b, type
 */
export function findAspects(lons, conv) {
  const names = conv.aspects.bodies.filter((n) => lons[n] !== undefined && lons[n] !== null);
  const out = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const diff = separation(lons[a], lons[b]);
      for (const kind of ['major', 'minor']) {
        for (const [type, spec] of Object.entries(conv.orbs[kind])) {
          const orb = Math.abs(diff - spec.angle);
          if (orb <= orbLimit(spec, a, b)) {
            out.push({ a, b, type, major: kind === 'major', orb: round4(orb) });
          }
        }
      }
    }
  }
  out.sort((x, y) => x.orb - y.orb || cmp(x.a, y.a) || cmp(x.b, y.b) || cmp(x.type, y.type));
  return out;
}

/**
 * The n tightest major aspects for the worksheet (page 18). Ruling: aspects that
 * involve the Ascendant or MC (including Asc-MC itself) never take a slot.
 * Input must already be sorted (findAspects output).
 */
export function tightestAspects(aspects, n = 3) {
  return aspects.filter((x) => x.major && !ANGLES.has(x.a) && !ANGLES.has(x.b)).slice(0, n);
}
