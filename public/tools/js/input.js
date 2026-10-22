// Checks for the chart form. Pure functions, no DOM. Error texts use plain words.

const MIN = '1900-01-01';
const MAX = '2100-12-31';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/**
 * @param {string} s 'YYYY-MM-DD' (the value of <input type=date>)
 * @returns {{ok:true, value:{y,m,d}} | {ok:false, error:string}}
 */
export function checkDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return { ok: false, error: 'Enter your birth date as day, month and year.' };
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(2000, mo - 1, d));
  t.setUTCFullYear(y);
  if (mo < 1 || mo > 12 || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    return { ok: false, error: 'This date does not exist. Check the day and the month.' };
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (iso < MIN || iso > MAX) {
    return { ok: false, error: 'The tool works for birth dates from 1 January 1900 to 31 December 2100.' };
  }
  return { ok: true, value: { y, m: mo, d } };
}

/** @param {string} s 'HH:MM' (the value of <input type=time>) */
export function checkTime(s) {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(s || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) {
    return { ok: false, error: 'Enter your birth time as hours and minutes, or tick "I don\'t know my birth time".' };
  }
  return { ok: true, value: { h: +m[1], mi: +m[2] } };
}

/**
 * Hand-typed UTC offset like '+2', '-5:30', '+05:45'.
 * @returns {{ok:true, minutes:number} | {ok:false, error:string}}
 */
export function checkOffset(s) {
  const m = /^([+-])?(\d{1,2})(?::?(\d{2}))?$/.exec(String(s || '').trim().replace(/^UTC/i, ''));
  if (!m) return { ok: false, error: 'Enter the UTC offset like +1, -5 or +5:30.' };
  const mins = (+m[2]) * 60 + (m[3] ? +m[3] : 0);
  if (mins > 14 * 60 || (m[3] && +m[3] > 59)) return { ok: false, error: 'A UTC offset is between -12:00 and +14:00.' };
  return { ok: true, minutes: m[1] === '-' ? -mins : mins };
}

/** '14 March 1879' */
export const formatDate = ({ y, m, d }) => `${d} ${MONTHS[m - 1]} ${y}`;

/** '11:30' */
export const formatTime = ({ h, mi }) => `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
