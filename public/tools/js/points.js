// Derived chart points: Part of Fortune, day/night, South Node.
// Same rules as the oracle (daily-oracle-repo scripts/make_oracle.py).

const norm360 = (x) => {
  let r = x % 360;
  if (r < 0) r += 360;
  if (r >= 360) r -= 360;
  return r + 0;
};

/** Day chart when the Sun is above the horizon by whole sign: houses 7-12. */
export function isDayChart(sunHouse) {
  return sunHouse >= 7;
}

/** Part of Fortune: Asc + Moon - Sun by day, Asc + Sun - Moon by night. Degrees 0-360. */
export function fortune(asc, sun, moon, isDay) {
  return norm360(isDay ? asc + moon - sun : asc + sun - moon);
}

/** South Node: opposite the (mean) North Node. */
export function southNode(n) {
  return norm360(n + 180);
}
