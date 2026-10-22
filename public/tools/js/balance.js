// Element and mode balance (ebook page 15). Same counting as the oracle
// (daily-oracle-repo scripts/make_oracle.py): bodies from conv.elementsAndModes.bodies,
// one point each (total 8 with the Ascendant, 7 without). The "double" variant counts
// Sun, Moon and Ascendant twice (total 11, or 9 without the Ascendant).

export const SIGNS = Object.freeze(['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']);
export const ELEMENTS = Object.freeze(['fire', 'earth', 'air', 'water']);
export const MODES = Object.freeze(['cardinal', 'fixed', 'mutable']);
const DOUBLE = new Set(['Sun', 'Moon', 'Ascendant']);

const signIndex = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);

/**
 * @param {Object<string, number|null>} lons longitudes by body name; a missing or null
 *   Ascendant (no birth time, polar latitude) is simply not counted.
 * @param {object} conv conventions.json
 * @returns {{elements, modes, elementsDouble, modesDouble, strongestElements, weakestElements}}
 *   strongestElements / weakestElements are arrays: every element tied for the
 *   highest / lowest single count, in the order fire, earth, air, water.
 */
export function elementBalance(lons, conv) {
  const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
  const elements = zero(ELEMENTS), modes = zero(MODES);
  const elementsDouble = zero(ELEMENTS), modesDouble = zero(MODES);
  for (const name of conv.elementsAndModes.bodies) {
    const lon = lons[name];
    if (lon === undefined || lon === null) continue;
    const s = signIndex(lon);
    const w = DOUBLE.has(name) ? 2 : 1;
    elements[ELEMENTS[s % 4]] += 1;
    modes[MODES[s % 3]] += 1;
    elementsDouble[ELEMENTS[s % 4]] += w;
    modesDouble[MODES[s % 3]] += w;
  }
  const vals = Object.values(elements);
  const mx = Math.max(...vals), mn = Math.min(...vals);
  return {
    elements, modes, elementsDouble, modesDouble,
    strongestElements: ELEMENTS.filter((e) => elements[e] === mx),
    weakestElements: ELEMENTS.filter((e) => elements[e] === mn),
  };
}
