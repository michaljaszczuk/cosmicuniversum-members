// Aspect patterns (ebook page 18): stellium, grand trine, kite, grand cross,
// T-square, yod. Exact port of the oracle (daily-oracle-repo scripts/make_oracle.py
// _patterns). Bodies: the 10 planets only. Relations use the aspect orb rule with the
// major aspects plus the quincunx. Yod = standard: a sextile base and two quincunxes
// to the apex. A T-square inside a grand cross and a grand trine inside a kite are
// not listed separately. Output order: stelliums, grand trines, kites, grand crosses,
// T-squares, yods; bodies in planet order.

import { separation, orbLimit } from './aspects.js';
import { SIGNS } from './balance.js';

function* combos(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return; }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combos(arr, k, i + 1, acc);
    acc.pop();
  }
}

const signIndex = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);

/**
 * @param {Object<string, number>} lons planet longitudes by name
 * @param {object} conv conventions.json
 * @returns {{type:string, bodies:string[], sign?:string}[]}
 */
export function findPatterns(lons, conv) {
  const planets = conv.bodies.planets.filter((p) => lons[p] !== undefined && lons[p] !== null);
  const order = (list) => list.slice().sort((x, y) => planets.indexOf(x) - planets.indexOf(y));
  const rel = new Map();
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const [a, b] of combos(planets, 2)) {
    const diff = separation(lons[a], lons[b]);
    for (const kind of ['major', 'minor']) {
      for (const [type, spec] of Object.entries(conv.orbs[kind])) {
        if (kind === 'minor' && type !== 'quincunx') continue;
        if (Math.abs(diff - spec.angle) <= orbLimit(spec, a, b)) rel.set(key(a, b), type);
      }
    }
  }
  const r = (a, b) => rel.get(key(a, b));
  const res = [];

  for (let s = 0; s < 12; s++) {
    const members = planets.filter((p) => signIndex(lons[p]) === s);
    if (members.length >= 3) res.push({ type: 'stellium', bodies: members, sign: SIGNS[s] });
  }

  const gts = [...combos(planets, 3)].filter(
    (t) => r(t[0], t[1]) === 'trine' && r(t[0], t[2]) === 'trine' && r(t[1], t[2]) === 'trine');

  const kites = [];
  const kiteGts = new Set();
  for (const t of gts) {
    for (const d of planets) {
      if (t.includes(d)) continue;
      for (const apex of t) {
        const others = t.filter((x) => x !== apex);
        if (r(d, apex) === 'opposition' && others.every((o) => r(d, o) === 'sextile')) {
          kites.push(order([...t, d]));
          kiteGts.add(t.join(','));
        }
      }
    }
  }

  const crosses = [];
  for (const q of combos(planets, 4)) {
    const layouts = [[q[0], q[1], q[2], q[3]], [q[0], q[2], q[1], q[3]], [q[0], q[1], q[3], q[2]]];
    for (const [a, b, c, d] of layouts) {
      // a-c and b-d opposite, the four sides square
      if (r(a, c) === 'opposition' && r(b, d) === 'opposition'
        && [[a, b], [b, c], [c, d], [d, a]].every(([x, y]) => r(x, y) === 'square')) {
        crosses.push(q);
        break;
      }
    }
  }

  const tsq = [];
  for (const t of combos(planets, 3)) {
    for (const apex of t) {
      const [b0, b1] = t.filter((x) => x !== apex);
      if (r(b0, b1) === 'opposition' && r(apex, b0) === 'square' && r(apex, b1) === 'square') {
        if (!crosses.some((q) => t.every((x) => q.includes(x)))) tsq.push(t);
      }
    }
  }

  const yods = [];
  for (const [a, b] of combos(planets, 2)) {
    if (r(a, b) !== 'sextile') continue;
    for (const c of planets) {
      if (c !== a && c !== b && r(a, c) === 'quincunx' && r(b, c) === 'quincunx') {
        yods.push(order([a, b, c]));
      }
    }
  }

  for (const t of gts) if (!kiteGts.has(t.join(','))) res.push({ type: 'grand trine', bodies: t });
  for (const k of kites) res.push({ type: 'kite', bodies: k });
  for (const q of crosses) res.push({ type: 'grand cross', bodies: q });
  for (const t of tsq) res.push({ type: 't-square', bodies: t });
  for (const y of yods) res.push({ type: 'yod', bodies: y });
  return res;
}
