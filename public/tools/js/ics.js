// iCalendar (RFC 5545) file for the 2027 sky calendar. Pure: builds a string, nothing is sent.

import { toLocal, eventTitle, placeText } from './calendar.js';

const enc = new TextEncoder();

/** Bump when calendar-2027.json changes, so calendar apps replace events already imported. */
export const CALENDAR_DATA_VERSION = 2;

/** Escape TEXT values (RFC 5545 3.3.11). */
export const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
  .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold a content line to at most 75 octets per physical line, never splitting a character. */
function fold(line) {
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with one space
    if (len + n > limit) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** UTC ISO -> iCalendar basic UTC form, e.g. 20270107T202400Z. */
const basic = (iso) => {
  const d = new Date(Date.parse(iso));
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

function uid(e) {
  const who = e.type === 'station' ? `-${e.planet}-${e.direction}` : e.type === 'eclipse' ? `-${e.eclipse || ''}` : '';
  return `${e.type}${who}-${basic(e.utc)}@cosmicuniversum.com`.toLowerCase();
}

/**
 * @param {object[]} events calendar-2027.json events
 * @param {string} tz reader's IANA zone (shown in the description; DTSTART is UTC)
 * @param {{stamp?: string}} [opt] DTSTAMP as UTC ISO (default: fixed, so output is reproducible)
 * @returns {string} .ics text with CRLF line ends
 */
export function makeIcs(events, tz, opt = {}) {
  const dtstamp = basic(opt.stamp || '2026-10-22T00:00:00Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cosmic_universum//Sky calendar 2027//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Sky calendar 2027'];
  const sorted = [...events].sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
  for (const e of sorted) {
    const loc = toLocal(e.utc, tz);
    const start = basic(e.utc);
    const end = basic(new Date(Date.parse(e.utc) + 15 * 60000).toISOString());
    const title = `${eventTitle(e)} · ${placeText(e)}`;
    const desc = `${e.detail}. ${e.sign} ${e.deg}°. UTC ${e.utc.slice(0, 10)} ${e.utc.slice(11, 16)}. `
      + `Your time (${tz}): ${loc.date} ${loc.time}.`;
    L.push('BEGIN:VEVENT', `UID:${uid(e)}`, `DTSTAMP:${dtstamp}`, `SEQUENCE:${CALENDAR_DATA_VERSION}`, `DTSTART:${start}`, `DTEND:${end}`,
      `SUMMARY:${escapeText(title)}`, `DESCRIPTION:${escapeText(desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
