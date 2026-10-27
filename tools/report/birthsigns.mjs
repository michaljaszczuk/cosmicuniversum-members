// Birth rune and life path number for the paid report. Pure date maths, no AI, no guessing.
//
// Birth rune: the runic half-months of Nigel Pennick (a modern calendar, 20th century).
// PAGAN is the table we use: Pagan Pages, "Runic Divination" (2009), "based on his chart but simplified
// so that only one rune rules any given day". VOGUE is Vogue Scandinavia's table of the same calendar:
// its first day of each rune is also the last day of the rune before, and February differs by 1-2 days.
// Where VOGUE gives another rune for a date, the report says that calendars differ (edge).
//
// Life path: the most common method ("reduce-parts"). Reduce month, day and year each to one digit
// (11, 22 and 33 stay), add them, reduce again (11, 22 and 33 stay).

// [month, first day, rune], in calendar order from Fehu (29 June).
const PAGAN = [
  [6, 29, 'Fehu'], [7, 14, 'Uruz'], [7, 29, 'Thurisaz'], [8, 13, 'Ansuz'], [8, 29, 'Raidho'],
  [9, 13, 'Kenaz'], [9, 28, 'Gebo'], [10, 13, 'Wunjo'], [10, 28, 'Hagalaz'], [11, 13, 'Nauthiz'],
  [11, 28, 'Isa'], [12, 13, 'Jera'], [12, 28, 'Eihwaz'], [1, 13, 'Perthro'], [1, 28, 'Algiz'],
  [2, 12, 'Sowilo'], [2, 27, 'Tiwaz'], [3, 14, 'Berkano'], [3, 30, 'Ehwaz'], [4, 14, 'Mannaz'],
  [4, 29, 'Laguz'], [5, 14, 'Ingwaz'], [5, 29, 'Othala'], [6, 14, 'Dagaz'],
];
const VOGUE = PAGAN.map(([m, d, rune]) => (rune === 'Sowilo' ? [2, 13, rune] : [m, d, rune]));

export const RUNES = PAGAN.map(([, , rune]) => rune);

const key = (m, d) => m * 100 + d; // 229 sits between 227 and 301, so 29 Feb needs no special case
const pad = (m, d) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Index of the table row whose period holds the date (periods wrap at the year end).
function rowFor(table, m, d) {
  // The latest first day on or before the date; before the first one in January, the last one in December.
  const k = key(m, d);
  const keys = table.map(([tm, td]) => key(tm, td));
  const before = keys.filter((tk) => tk <= k);
  return keys.indexOf(Math.max(...(before.length ? before : keys)));
}

function dayBefore(m, d) {
  const t = new Date(Date.UTC(2001, m - 1, d) - 86400000); // 2001: not a leap year, the end day is 26 Feb
  return [t.getUTCMonth() + 1, t.getUTCDate()];
}

export function birthRune(month, day) {
  const i = rowFor(PAGAN, month, day);
  const [fm, fd, rune] = PAGAN[i];
  const [nm, nd] = PAGAN[(i + 1) % PAGAN.length];
  const [tm, td] = dayBefore(nm, nd);
  // Vogue: the rune whose period holds the date, plus the rune before on a first day.
  const v = rowFor(VOGUE, month, day);
  const vogue = new Set([VOGUE[v][2]]);
  if (VOGUE[v][0] === month && VOGUE[v][1] === day) vogue.add(VOGUE[(v + VOGUE.length - 1) % VOGUE.length][2]);
  const other = [...vogue].filter((r) => r !== rune);
  return { rune, from: pad(fm, fd), to: pad(tm, td), edge: other.length ? { other } : null };
}

const MASTER = new Set([11, 22, 33]);
function reduce(n) {
  while (n > 9 && !MASTER.has(n)) n = String(n).split('').reduce((a, c) => a + Number(c), 0);
  return n;
}

export function lifePath(y, m, d) {
  const steps = { month: reduce(m), day: reduce(d), year: reduce(y) };
  const sum = steps.month + steps.day + steps.year;
  return { number: reduce(sum), steps, sum, method: 'reduce-parts' };
}
