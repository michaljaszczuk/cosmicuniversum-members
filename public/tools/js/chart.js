// Chart assembly: positions, angles, points, whole sign houses, balance, aspects,
// patterns, moon phase, chart ruler and warnings. Follows the oracle
// (daily-oracle-repo scripts/make_oracle.py make_chart) field for field; the
// expected shape is tools/tests/oracle/charts.json.
//
// Time scales: planet positions, node and Lilith use TT (eph.ttFromUtc); the angles
// use UT1 (eph.ut1FromUtc), as houses.js expects. Both start from the UTC Julian date.

import { jdFromDate, localToUtc } from './time.js';
import { angles, wholeSignHouse, norm360 } from './houses.js';
import { fortune as fortunePoint, isDayChart, southNode } from './points.js';
import { meanNode, meanLilith } from './ephemeris.js';
import { SIGNS, elementBalance } from './balance.js';
import { findAspects, tightestAspects } from './aspects.js';
import { findPatterns } from './patterns.js';

export { SIGNS };

const NO_RETRO = new Set(['Sun', 'Moon']);
// Plain floor, clamped to 11; the worksheet clamps the degree to 29 to match.
const signIndex = (lon) => Math.min(11, Math.floor(norm360(lon) / 30));
export const signOf = (lon) => SIGNS[signIndex(lon)];

/** Moon phase name (page 14) from the Sun-Moon elongation, using conv.moonPhases. */
export function moonPhase(sun, moon, conv) {
  const el = norm360(moon - sun);
  for (const ph of conv.moonPhases) if (ph.from <= el && el < ph.to) return ph.name;
  return conv.moonPhases[conv.moonPhases.length - 1].name;
}

/** Rising-sign ruler from conv.chartRulers: {traditional, modern|null}. */
export function rulerOf(sign, conv) {
  const r = conv.chartRulers[sign];
  return { traditional: r.traditional, modern: r.modern ?? null };
}

// UTC instants of the start and end (next local midnight) of the local calendar day
// containing `utc` in zone `tz`. Same as the oracle: a midnight that falls in a
// spring-forward gap maps to the transition instant (01:00 local, after the jump);
// an ambiguous midnight takes the earlier instant.
function localDayBounds(utc, tz) {
  const p = {};
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', era: 'short',
  });
  for (const x of f.formatToParts(utc)) p[x.type] = x.value;
  const y = p.era === 'B' ? 1 - +p.year : +p.year;
  const at = (yy, m, d) => {
    let r = localToUtc({ y: yy, m, d, h: 0, mi: 0 }, tz);
    if (r.status === 'missing') r = localToUtc({ y: yy, m, d, h: 1, mi: 0 }, tz);
    if (r.status === 'ambiguous') return r.options[0];
    return r.utc;
  };
  const next = new Date(Date.UTC(2000, +p.month - 1, +p.day + 1));
  next.setUTCFullYear(y + (next.getUTCFullYear() - 2000));
  return [at(y, +p.month, +p.day), at(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())];
}

/**
 * Build a natal chart.
 * @param {{utc:Date, lat:number, lon:number, hasTime:boolean, tz?:string}} input
 *   utc: birth instant (for no birth time, the caller passes local noon).
 *   tz: IANA zone, only used for the no-time Moon sign check (whole local day); without
 *   it the check spans utc +/- 12 h.
 * @param {object} eph loaded ephemeris (loadEphemeris())
 * @param {object} conv conventions.json
 * @returns Chart: the oracle's `expected` fields (planets, asc, mc, vertex, node,
 *   southNode, lilith, fortune, fortuneIsDay, houses, elements, modes, elementsDouble,
 *   modesDouble, strongestElements, weakestElements, aspects, patterns, moonPhase,
 *   moonSignUncertain) plus planets[name].sign / .house, chartRuler
 *   {traditional, modern, sign, house}, strongestElement / weakestElement (the same
 *   arrays as strongestElements / weakestElements: ties list every tied element),
 *   tightestAspects (3 majors, none involving Ascendant or MC) and warnings:
 *   'noBirthTime', 'moonSignUncertain', 'ascendantUndefined' (polar latitude: no
 *   Rising, houses, ruler or Fortune), 'vertexUnreliable' (|lat| < 1 or > 66).
 */
export function buildChart(input, eph, conv) {
  const { utc, lat, lon, hasTime } = input;
  const jdUtc = jdFromDate(utc);
  const jdTT = eph.ttFromUtc(jdUtc);
  const jdUT1 = eph.ut1FromUtc(jdUtc);
  const warnings = [];

  const bodies = [...conv.bodies.planets, ...conv.bodies.extra];
  const planets = {};
  const lons = {};
  for (const name of bodies) {
    const { lon: L, speed } = eph.longitude(name, jdTT);
    planets[name] = {
      lon: L, retro: NO_RETRO.has(name) ? false : speed < 0, speed, sign: signOf(L), house: null,
    };
    lons[name] = L;
  }

  const node = meanNode(jdTT);
  const south = southNode(node);
  const lilith = meanLilith(jdTT);

  let asc = null, mc = null, vertex = null, fortune = null, fortuneIsDay = null, houses = null;
  let chartRuler = null;
  if (hasTime) {
    const ang = angles(jdUT1, lat, lon);
    mc = ang.mc;
    vertex = ang.vertex;
    asc = ang.asc;
    if (Math.abs(lat) < 1 || Math.abs(lat) > (conv.maxLatitude ?? 66)) warnings.push('vertexUnreliable');
    if (asc === null) {
      warnings.push('ascendantUndefined');
    } else {
      fortuneIsDay = isDayChart(wholeSignHouse(lons.Sun, asc));
      fortune = fortunePoint(asc, lons.Sun, lons.Moon, fortuneIsDay);
      const pts = { ...lons, NorthNode: node, SouthNode: south, Lilith: lilith, Fortune: fortune, Vertex: vertex };
      houses = {};
      for (const [k, v] of Object.entries(pts)) houses[k] = v === null ? null : wholeSignHouse(v, asc);
      houses.Ascendant = 1;
      houses.MC = 10;
      for (const name of bodies) planets[name].house = houses[name];
      const sign = signOf(asc);
      const r = rulerOf(sign, conv);
      chartRuler = { ...r, risingSign: sign, sign: planets[r.traditional].sign, house: houses[r.traditional] };
    }
  } else {
    warnings.push('noBirthTime');
  }

  const balance = elementBalance({ ...lons, Ascendant: asc }, conv);
  const aspects = findAspects({ ...lons, Ascendant: asc, MC: mc }, conv);

  let moonSignUncertain = null;
  if (!hasTime) {
    const [t0, t1] = input.tz
      ? localDayBounds(utc, input.tz)
      : [new Date(utc.getTime() - 43200000), new Date(utc.getTime() + 43200000)];
    const m0 = eph.longitude('Moon', eph.ttFromUtc(jdFromDate(t0))).lon;
    const m1 = eph.longitude('Moon', eph.ttFromUtc(jdFromDate(t1))).lon;
    moonSignUncertain = signIndex(m0) !== signIndex(m1);
    if (moonSignUncertain) warnings.push('moonSignUncertain');
  }

  return {
    planets,
    asc, mc, vertex, node, southNode: south, lilith, fortune, fortuneIsDay,
    houses,
    ...balance,
    strongestElement: balance.strongestElements,
    weakestElement: balance.weakestElements,
    aspects,
    tightestAspects: tightestAspects(aspects, 3),
    patterns: findPatterns(lons, conv),
    moonPhase: moonPhase(lons.Sun, lons.Moon, conv),
    moonSignUncertain,
    chartRuler,
    warnings,
  };
}
