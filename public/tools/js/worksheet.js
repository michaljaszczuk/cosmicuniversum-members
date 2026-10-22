// Chart -> the text of every worksheet field (ebook v2 pages 16, 17, 18).
// Pure: no DOM, no PDF. pdf.js writes these strings into the form fields (editable
// version) or draws them on the page (print version); the page shows the same words.
//
// Rules (spec section 8, field-map.json _meta):
// - degree: whole degree inside the sign, as the ebook prints it ('12°');
// - retrograde mark '℞' only when the chart says retro and the body is not in
//   conv.bodies.noRetroMark; never for Midheaven or the page 17 points;
// - no birth time / polar latitude: houses, Rising, chart ruler, Midheaven house,
//   Part of Fortune and Vertex are left blank (null values in the chart);
// - Vertex is also left blank when the chart warns 'vertexUnreliable';
// - the reader's writing fields (field-map _meta.writingOnly) are always ''.

export const RETRO_MARK = '℞';

const ROWS = [
  ['sun', 'Sun'], ['moon', 'Moon'], ['mercury', 'Mercury'], ['venus', 'Venus'], ['mars', 'Mars'],
  ['jupiter', 'Jupiter'], ['saturn', 'Saturn'], ['uranus', 'Uranus'], ['neptune', 'Neptune'],
  ['pluto', 'Pluto'], ['northNode', 'NorthNode'], ['chiron', 'Chiron'],
];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio',
  'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const PATTERN_NAMES = {
  stellium: 'Stellium', 'grand trine': 'Grand trine', kite: 'Kite', 'grand cross': 'Grand cross',
  't-square': 'T-square', yod: 'Yod',
};
export const POINT_NAMES = {
  NorthNode: 'North Node', SouthNode: 'South Node', Lilith: 'Black Moon Lilith',
  Fortune: 'Part of Fortune', Vertex: 'Vertex', MC: 'Midheaven', Ascendant: 'Ascendant',
};

const norm = (x) => ((x % 360) + 360) % 360;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Sign from the plain floor (as chart.js, balance and the oracle); the degree is clamped
// to 29 so a longitude a hair below a cusp never reads 'Aries 30°'.
export const signName = (lon) => SIGNS[Math.min(11, Math.floor(norm(lon) / 30))];
export const bodyName = (k) => POINT_NAMES[k] ?? k;

/** Whole degree inside the sign: 353.49 -> '23°'. */
export function formatDegree(lon) {
  return `${Math.min(29, Math.floor(norm(lon) % 30 + 1e-9))}°`;
}

/** Orb with one decimal: 1.0621 -> '1.1°'. */
export const formatOrb = (orb) => `${orb.toFixed(1)}°`;

/** 'Stellium in Aries (Mercury, Venus, Saturn)'; joined with '; '. 'None found' if empty. */
export function patternsLine(patterns) {
  if (!patterns.length) return 'None found';
  return patterns.map((p) => {
    const name = PATTERN_NAMES[p.type] ?? cap(p.type);
    return `${name}${p.sign ? ` in ${p.sign}` : ''} (${p.bodies.join(', ')})`;
  }).join('; ');
}

/** Short form for a narrow line: 'Stellium in Aries; T-square'. */
export function patternsShort(patterns) {
  if (!patterns.length) return 'None found';
  return patterns.map((p) => `${PATTERN_NAMES[p.type] ?? cap(p.type)}${p.sign ? ` in ${p.sign}` : ''}`).join('; ');
}

const listNames = (arr) => arr.map(cap).join(', ');

// The letters the worksheet font (DejaVuSans-worksheet.ttf, tools/build/make-worksheet-font.py)
// can show: Latin, Greek, Cyrillic and common punctuation.
const SHOWABLE_CHAR = /[\u0020-\u007E\u00A0-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2010-\u2027\u211E]/u;

/** True when the PDF fonts can show every letter of the text. */
export const canShow = (text) => [...String(text).normalize('NFC')].every((ch) => SHOWABLE_CHAR.test(ch));

/**
 * Keep only the letters the PDF fonts can show.
 * @returns {{text:string, dropped:boolean}}
 */
export function keepShowable(text) {
  const chars = [...String(text || '').normalize('NFC')];
  const kept = chars.filter((ch) => SHOWABLE_CHAR.test(ch));
  return { text: kept.join('').replace(/\s+/g, ' ').trim(), dropped: kept.length !== chars.length };
}

/** Plain-words notices for text the PDF cannot show completely. */
export function pdfTextNotices(name, place) {
  const out = [];
  if (keepShowable(name).dropped) out.push('Some letters in your name could not be printed in the PDF. You can type them in the editable version.');
  if (keepShowable(place).dropped) out.push('Some letters in your birth place could not be printed in the PDF. You can type them in the editable version.');
  return out;
}

/**
 * Worksheet items by field-map item name (e.g. 'sun.sign', 'balance.fire').
 * @param chart buildChart() result
 * @param {string} name reader's name ('' allowed)
 * @param {{date?:string, time?:string, place?:string}} birth display strings
 * @param conv conventions.json
 */
export function worksheetItems(chart, name, birth, conv) {
  const noRetro = new Set(conv.bodies.noRetroMark);
  const h = chart.houses; // null without a time or at polar latitudes
  const house = (key) => (h && h[key] != null ? String(h[key]) : '');
  const it = {
    name: name || '',
    birthPlace: birth.place || '',
    birthDate: birth.date || '',
    birthTime: birth.time || (chart.warnings.includes('noBirthTime') ? 'Unknown' : ''),
  };

  const lonOf = { NorthNode: chart.node };
  for (const [row, body] of ROWS) {
    const p = chart.planets[body];
    const lon = p ? p.lon : lonOf[body];
    it[`${row}.sign`] = signName(lon);
    it[`${row}.degree`] = formatDegree(lon);
    it[`${row}.house`] = house(body);
    it[`${row}.retro`] = p && p.retro && !noRetro.has(body) ? RETRO_MARK : '';
  }
  const mc = chart.mc;
  it['midheaven.sign'] = mc == null ? '' : signName(mc);
  it['midheaven.degree'] = mc == null ? '' : formatDegree(mc);
  it['midheaven.house'] = mc == null || !h ? '' : '10';
  it['midheaven.retro'] = '';

  it['bigThree.sun'] = chart.planets.Sun.sign;
  it['bigThree.moon'] = chart.planets.Moon.sign;
  it['bigThree.rising'] = chart.asc == null ? '' : signName(chart.asc);

  const r = chart.chartRuler;
  it.chartRuler = r ? r.traditional : '';
  it['chartRuler.signHouse'] = r ? `${r.sign}, house ${r.house}` : '';

  const vertexOk = !chart.warnings.includes('vertexUnreliable');
  const points = [
    ['southNode', chart.southNode, 'SouthNode'],
    ['lilith', chart.lilith, 'Lilith'],
    ['partOfFortune', chart.fortune, 'Fortune'],
    ['vertex', vertexOk ? chart.vertex : null, 'Vertex'],
  ];
  for (const [row, lon, key] of points) {
    it[`${row}.sign`] = lon == null ? '' : signName(lon);
    it[`${row}.degree`] = lon == null ? '' : formatDegree(lon);
    it[`${row}.house`] = lon == null ? '' : house(key);
  }

  for (const [k, v] of Object.entries(chart.elements)) it[`balance.${k}`] = String(v);
  for (const [k, v] of Object.entries(chart.modes)) it[`balance.${k}`] = String(v);
  it.strongestElement = listNames(chart.strongestElement);
  it.weakestElement = listNames(chart.weakestElement);
  it.moonPhase = chart.moonPhase;

  chart.tightestAspects.forEach((a, i) => {
    const n = i + 1;
    it[`aspect${n}.planetA`] = bodyName(a.a);
    it[`aspect${n}.aspect`] = cap(a.type);
    it[`aspect${n}.planetB`] = bodyName(a.b);
    it[`aspect${n}.orb`] = formatOrb(a.orb);
  });
  it.patterns = patternsLine(chart.patterns);
  return it;
}

/**
 * Field name -> text for every field in the map (writing fields and anything the
 * chart cannot give are '').
 */
export function worksheetValues(chart, name, birth, conv, fieldMap) {
  const items = worksheetItems(chart, name, birth, conv);
  const writing = new Set(Object.values(fieldMap._meta.writingOnly).flat());
  const out = {};
  for (const page of ['page16', 'page17', 'page18']) {
    for (const [item, field] of Object.entries(fieldMap[page])) {
      out[field] = writing.has(item) ? '' : (items[item] ?? '');
    }
  }
  return out;
}
