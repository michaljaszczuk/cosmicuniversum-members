// Planet returns for the paid report: when a slow planet comes back to its birth position.
// Pure functions over the site ephemeris (public/tools/js/ephemeris.js). Dates are TT Julian dates.

const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

/** Julian dates in [fromJd, toJd] (clipped to the ephemeris range) where `body` is exactly at natalLon. */
export function findPasses(eph, body, natalLon, fromJd, toJd) {
  const lo = Math.max(fromJd, eph.range[0]);
  const hi = Math.min(toJd, eph.range[1]);
  const d = (jd) => wrap180(eph.lon(body, jd) - natalLon);
  const out = [];
  let prevJd = lo;
  let prev = d(lo);
  for (let jd = lo + 1; jd <= hi; jd += 1) {
    const cur = d(jd);
    if (Math.sign(cur) !== Math.sign(prev) && Math.abs(cur) < 20 && Math.abs(prev) < 20) {
      let a = prevJd;
      let b = jd;
      while (b - a > 0.001) {
        const m = (a + b) / 2;
        if (Math.sign(d(m)) === Math.sign(d(a))) a = m; else b = m;
      }
      out.push((a + b) / 2);
    }
    prevJd = jd;
    prev = cur;
  }
  return out;
}

const isoDate = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);

/** Group passes less than 400 days apart into returns: [{ n, first, last, passes, ageStart, status }]. */
export function groupReturns(passes, birthJd, todayJd) {
  const groups = [];
  for (const p of passes) {
    const g = groups[groups.length - 1];
    if (g && p - g[g.length - 1] < 400) g.push(p); else groups.push([p]);
  }
  return groups.map((g, i) => {
    const first = g[0];
    const last = g[g.length - 1];
    return {
      n: i + 1,
      first: isoDate(first),
      last: isoDate(last),
      passes: g.length,
      ageStart: Math.floor((first - birthJd) / 365.25),
      status: last < todayJd ? 'past' : first <= todayJd ? 'now' : 'coming',
    };
  });
}
