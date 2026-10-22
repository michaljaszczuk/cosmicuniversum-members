// Chart page result: the chart facts on screen in the ebook's words and page order.
// Facts only, no interpretation text. Built with DOM nodes (no innerHTML with input).

import {
  worksheetItems, formatOrb, bodyName, cap, patternsLine, RETRO_MARK,
} from './worksheet.js';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio',
  'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const ROWS16 = [
  ['sun', 'Sun', '☉'], ['moon', 'Moon', '☽'], ['mercury', 'Mercury', '☿'], ['venus', 'Venus', '♀'],
  ['mars', 'Mars', '♂'], ['jupiter', 'Jupiter', '♃'], ['saturn', 'Saturn', '♄'], ['uranus', 'Uranus', '♅'],
  ['neptune', 'Neptune', '♆'], ['pluto', 'Pluto', '♇'], ['northNode', 'North Node', '☊'],
  ['chiron', 'Chiron', '⚷'], ['midheaven', 'Midheaven', 'MC'],
];
const ROWS17 = [
  ['southNode', 'South Node', '☋'], ['lilith', 'Black Moon Lilith', '⚸'],
  ['partOfFortune', 'Part of Fortune', '⊗'], ['vertex', 'Vertex', 'Vx'],
];
const ELEMENTS = ['fire', 'earth', 'air', 'water'];
const MODES = ['cardinal', 'fixed', 'mutable'];

/** el('p', {className:'x'}, 'text', child, ...) */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k);
  return n;
}

const section = (title, page, ...kids) => el('section', { className: 'card' },
  el('h2', {}, title, page ? el('span', { className: 'page', text: ` page ${page}` }) : null), ...kids);

function table(head, rows, caption) {
  return el('div', { className: 'scroll' }, el('table', {},
    caption ? el('caption', { className: 'sr', text: caption }) : null,
    el('thead', {}, el('tr', {}, head.map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (i === 0
      ? el('th', { scope: 'row' }, c) : el('td', {}, c))))))));
}

const dash = (s) => s || '–';

// ---------------------------------------------------------------- warnings

function moonOtherSign(chart) {
  const lon = chart.planets.Moon.lon;
  const s = Math.floor(lon / 30);
  // The Moon moves 12-15° a day; at noon it is at most about 8° from where it was or will be.
  return (lon % 30) < 15 ? SIGNS[(s + 11) % 12] : SIGNS[(s + 1) % 12];
}

export function warningTexts(chart) {
  const w = chart.warnings;
  const out = [];
  if (w.includes('noBirthTime')) {
    out.push('No birth time: the planets are shown for 12:00 noon on your birth day. The houses, the Rising sign, the chart ruler, the Midheaven, the Vertex and the Part of Fortune need a birth time, so they stay empty (page 15, tip 2).');
    out.push('Without a birth time the Ascendant is not counted, so your element and mode counts add up to 7, not 8.');
  }
  if (w.includes('moonSignUncertain')) {
    out.push(`The Moon changed sign on your birth day. At noon it is in ${chart.planets.Moon.sign}, but at your real birth time it can be in ${moonOtherSign(chart)}. If you find your birth time, make the chart again.`);
  }
  if (w.includes('ascendantUndefined')) {
    out.push('Your birth place is very far north or south (more than about 66° from the equator). There the Rising sign cannot be calculated for this time. So the Rising sign, the houses, the chart ruler and the Part of Fortune are not available.');
  }
  if (w.includes('vertexUnreliable')) {
    out.push('Your birth place is very near the equator or very far north or south. There the Vertex calculation is not reliable, so the tool leaves the Vertex empty.');
  }
  return out;
}

// ---------------------------------------------------------------- parts

function bigThree(it, chart) {
  const rising = it['bigThree.rising'] || (chart.warnings.includes('noBirthTime') ? 'needs a birth time' : 'not available');
  const card = (glyph, label, value) => el('div', { className: 'b3' },
    el('span', { className: 'glyph', 'aria-hidden': 'true', text: glyph }),
    el('span', { className: 'b3-label', text: `${label} in` }),
    el('strong', { text: value }));
  return el('section', { className: 'big3', 'aria-labelledby': 'b3-h' },
    el('h2', { id: 'b3-h', text: 'Your Big Three' }),
    el('div', { className: 'b3-row' },
      card('☉', 'Sun', it['bigThree.sun']), card('☽', 'Moon', it['bigThree.moon']), card('AC', 'Rising', rising)));
}

function page16(it, chart) {
  const rows = ROWS16.map(([k, label, g]) => [
    [el('span', { className: 'glyph', 'aria-hidden': 'true', text: g }), ` ${label}`],
    dash(it[`${k}.sign`]), dash(it[`${k}.degree`]), dash(it[`${k}.house`]),
    it[`${k}.retro`] ? el('span', { title: 'retrograde', text: RETRO_MARK }) : '',
  ]);
  const r = chart.chartRuler;
  const retro = PLANETS.concat('Chiron').filter((p) => chart.planets[p].retro);
  const rulerText = r
    ? [el('strong', { text: r.traditional }), ` rules your Rising sign, ${r.risingSign}. Its sign and house: ${r.sign}, house ${r.house}.`,
      r.modern ? ` The modern ruler of ${r.risingSign} is ${r.modern} (in ${chart.planets[r.modern].sign}, house ${chart.houses[r.modern]}). The worksheet uses the traditional ruler, ${r.traditional} (pages 8–9).` : '']
    : ['The chart ruler needs the Rising sign, so it is not available.'];
  return section('My chart', 16,
    table(['Planet / point', 'Sign', 'Degree', 'House', RETRO_MARK], rows, 'Planets and points: sign, degree, house, retrograde'),
    el('p', { className: 'hint', text: `${RETRO_MARK} = retrograde. Sun, Moon and the nodes never get the mark. The Midheaven is always the top of house 10.` }),
    el('h3', { text: 'My chart ruler' }), el('p', {}, ...rulerText),
    el('p', { text: retro.length ? `Retrograde at birth: ${retro.join(', ')}.` : 'No planet was retrograde at birth.' }));
}

function page17(it) {
  const rows = ROWS17.map(([k, label, g]) => [
    [el('span', { className: 'glyph', 'aria-hidden': 'true', text: g }), ` ${label}`],
    dash(it[`${k}.sign`]), dash(it[`${k}.degree`]), dash(it[`${k}.house`]),
  ]);
  return section('My chart, part 2', 17, table(['Point', 'Sign', 'Degree', 'House'], rows, 'Four more points'));
}

function counts(chart, double) {
  const e = double ? chart.elementsDouble : chart.elements;
  const m = double ? chart.modesDouble : chart.modes;
  const total = Object.values(e).reduce((a, b) => a + b, 0);
  return el('div', {},
    el('div', { className: 'boxes' }, ELEMENTS.map((k) => el('div', { className: `box ${k}` },
      el('span', { text: cap(k) }), el('strong', { text: String(e[k]) })))),
    el('div', { className: 'boxes modes' }, MODES.map((k) => el('div', { className: 'box mode' },
      el('span', { text: cap(k) }), el('strong', { text: String(m[k]) })))),
    el('p', { className: 'hint', text: `Counted: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn${chart.asc == null ? '' : ' and the Ascendant'}${double ? ', with Sun, Moon and Ascendant counted twice' : ''}. Total: ${total}.` }));
}

function page18(it, chart) {
  const holder = el('div', {}, counts(chart, false));
  const sw = el('input', { type: 'checkbox', id: 'double' });
  sw.addEventListener('change', () => holder.replaceChildren(counts(chart, sw.checked)));
  const asp = chart.tightestAspects.map((a) => [bodyName(a.a), cap(a.type), bodyName(a.b), formatOrb(a.orb)]);
  return section('My balance & story', 18,
    holder,
    el('label', { className: 'check' }, sw, ' Count Sun, Moon and Ascendant twice (page 15 tip). Your worksheet PDF keeps the normal count.'),
    el('dl', { className: 'facts' },
      el('dt', { text: 'Strongest element' }), el('dd', { text: it.strongestElement }),
      el('dt', { text: 'Weakest element' }), el('dd', { text: it.weakestElement }),
      el('dt', { text: 'My moon phase' }), el('dd', { text: it.moonPhase })),
    el('h3', { text: 'My three tightest aspects' }),
    asp.length ? table(['Planet A', 'Aspect', 'Planet B', 'Orb'], asp, 'Three tightest major aspects')
      : el('p', { text: 'No major aspects found.' }),
    el('p', { className: 'hint', text: 'Major aspects between the ten planets, smallest orb first.' }),
    el('h3', { text: 'Patterns I found' }), el('p', { text: patternsLine(chart.patterns) }));
}

function allAspects(chart) {
  const row = (a) => el('li', {}, `${bodyName(a.a)} ${a.type} ${bodyName(a.b)}, orb ${formatOrb(a.orb)}`);
  const major = chart.aspects.filter((a) => a.major);
  const minor = chart.aspects.filter((a) => !a.major);
  return el('details', { className: 'card' },
    el('summary', { text: `All aspects (${major.length} major, ${minor.length} minor)` }),
    el('p', { className: 'hint', text: 'Page 12. Between the ten planets, the Ascendant and the Midheaven. Smallest orb first.' }),
    el('h3', { text: 'Major aspects' }), el('ul', {}, major.map(row)),
    el('h3', { text: 'Minor aspects' }), minor.length ? el('ul', {}, minor.map(row)) : el('p', { text: 'None.' }));
}

const sep = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

function checklist(it, chart) {
  const noTime = chart.houses == null;
  const r = chart.chartRuler;
  const e = chart.elements, m = chart.modes;
  const most = (o) => { const mx = Math.max(...Object.values(o)); return Object.keys(o).filter((k) => o[k] === mx).map(cap).join(', ') + ` (${mx})`; };
  const least = (o) => { const mn = Math.min(...Object.values(o)); return Object.keys(o).filter((k) => o[k] === mn).map(cap).join(', ') + ` (${mn})`; };

  const crowd = [];
  const stelliums = chart.patterns.filter((p) => p.type === 'stellium');
  crowd.push(stelliums.length
    ? stelliums.map((s) => `Stellium in ${s.sign}${noTime ? '' : `, house ${chart.houses[s.bodies[0]]}`}: ${s.bodies.join(', ')}.`).join(' ')
    : 'No stellium (no sign with 3 or more planets).');
  if (!noTime) {
    const hs = PLANETS.map((p) => chart.houses[p]);
    const above = hs.filter((h) => h >= 7).length;
    const east = hs.filter((h) => h >= 10 || h <= 3).length;
    crowd.push(`Upper half (houses 7–12): ${above} planets, lower half (houses 1–6): ${10 - above}. Eastern half (houses 10–3): ${east}, western half (houses 4–9): ${10 - east}.`);
  }

  let angles = 'Needs a birth time.';
  if (chart.asc != null && chart.mc != null) {
    const pts = [['AC', chart.asc], ['DC', chart.asc + 180], ['MC', chart.mc], ['IC', chart.mc + 180]];
    const near = [];
    for (const p of PLANETS) {
      for (const [n, lon] of pts) {
        const d = sep(chart.planets[p].lon, lon);
        if (d <= 5) near.push(`${p} is ${d.toFixed(1)}° from the ${n}`);
      }
    }
    angles = near.length ? `${near.join('; ')}.` : 'No planet within 5° of the AC, DC, MC or IC.';
  } else if (chart.mc != null) angles = 'The Ascendant is not available, so this step is skipped.';

  const top = chart.tightestAspects;
  const under3 = top.filter((a) => a.orb < 3).length;
  const key = new Set(['Sun', 'Moon', r && r.traditional].filter(Boolean));
  const withKey = top.filter((a) => key.has(a.a) || key.has(a.b))
    .map((a) => `${bodyName(a.a)} ${a.type} ${bodyName(a.b)}`);

  const steps = [
    ['The Big Three', `Sun in ${it['bigThree.sun']}, Moon in ${it['bigThree.moon']}, Rising in ${it['bigThree.rising'] || '– (not available)'}.`],
    ['The chart ruler', r ? `${r.traditional}, in ${r.sign}, house ${r.house}.${r.modern ? ` Modern ruler: ${r.modern}.` : ''}` : 'Not available (needs the Rising sign).'],
    ['Balance of elements & modes', `Most: ${most(e)}. Least: ${least(e)}. Modes, most: ${most(m)}; least: ${least(m)}.`],
    ['Where the planets crowd', crowd.join(' ')],
    ['Planets on the angles', angles],
    ['The tightest aspects', top.length
      ? `${top.map((a) => `${bodyName(a.a)} ${a.type} ${bodyName(a.b)} (${formatOrb(a.orb)})`).join('; ')}. ${under3} of them less than 3° from exact.${withKey.length ? ` With your Sun, Moon or chart ruler: ${withKey.join('; ')}.` : ''}`
      : 'No major aspects found.'],
    ['The lunar nodes', `North Node in ${it['northNode.sign']}${it['northNode.house'] ? `, house ${it['northNode.house']}` : ''}. South Node in ${it['southNode.sign']}${it['southNode.house'] ? `, house ${it['southNode.house']}` : ''}.`],
  ];
  return section('Reading order: 7 steps', 6,
    el('p', { className: 'hint', text: 'The facts for each step. The meaning is yours to write.' }),
    el('ol', { className: 'steps' }, steps.map(([h, t]) => el('li', {}, el('strong', { text: h }), el('br'), t))));
}

function howMade(conv) {
  const o = conv.orbs.major;
  const orbs = Object.entries(o).map(([k, v]) => `${k} ${v.min}–${v.max}°`).join(', ');
  return el('details', { className: 'card' },
    el('summary', { text: 'How this chart was made' }),
    el('ul', {},
      el('li', { text: 'Tropical zodiac. Planet positions from NASA JPL data (DE440s), seen from the Earth.' }),
      el('li', { text: 'Whole Sign houses: house 1 is the whole sign of your Rising sign (page 2).' }),
      el('li', { text: 'North Node: the mean node. South Node: exactly opposite. Black Moon Lilith: the mean lunar apogee.' }),
      el('li', { text: 'Part of Fortune: Ascendant + Moon − Sun by day, Ascendant + Sun − Moon by night (day = Sun in houses 7 to 12).' }),
      el('li', { text: `Orbs (page 12): ${orbs}. The tool uses the larger value when the Sun or Moon is in the aspect, the smaller value otherwise.` }),
      el('li', { text: 'Degrees are whole degrees inside the sign, as in the ebook (23° means 23° to 23°59′).' }),
      el('li', { text: 'Your birth time is changed to world time (UTC) with the time zone rules of your birth place, including summer time.' })));
}

/**
 * Render the result into `root`.
 * @returns {{editBtn:HTMLButtonElement, printBtn:HTMLButtonElement, status:HTMLElement}}
 */
export function renderChart(root, chart, conv, { name, birth }) {
  const it = worksheetItems(chart, name, birth, conv);
  const warns = warningTexts(chart);
  const editBtn = el('button', { type: 'button', id: 'get-edit', text: 'Get my worksheet pages' });
  const printBtn = el('button', { type: 'button', id: 'get-print', className: 'ghost', text: 'Get print version' });
  const status = el('p', { className: 'hint', id: 'pdf-status', 'aria-live': 'polite' });
  root.replaceChildren(...[
    el('p', { className: 'for', text: `Chart for ${birth.date}${birth.time ? `, ${birth.time}` : ' (birth time unknown)'}, ${birth.place}.` }),
    bigThree(it, chart),
    warns.length ? el('div', { className: 'warn', role: 'note' }, el('h2', { text: 'Please note' }), el('ul', {}, warns.map((w) => el('li', { text: w })))) : null,
    el('section', { className: 'card get' },
      el('h2', { text: 'Your worksheet pages' }),
      el('p', { text: 'Pages 16, 17 and 18 of the ebook, filled in with your chart. The writing lines stay empty for you.' }),
      editBtn, el('p', { className: 'hint', text: 'Editable PDF: type your sentences in a PDF app on your phone, tablet or computer.' }),
      printBtn, el('p', { className: 'hint', text: 'Print version: the same pages to print and write on by hand.' }),
      status),
    page16(it, chart), page17(it), page18(it, chart), allAspects(chart), checklist(it, chart), howMade(conv),
  ].filter(Boolean));
  root.hidden = false;
  return { editBtn, printBtn, status };
}

