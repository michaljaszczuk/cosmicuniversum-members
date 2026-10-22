import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toLocal, eventsByMonth, eventTitle } from '../../public/tools/js/calendar.js';
import { makeIcs } from '../../public/tools/js/ics.js';

const data = JSON.parse(readFileSync(new URL('../../public/tools/data/calendar-2027.json', import.meta.url), 'utf8'));
const events = data.events;

test('JSON: events sorted by time, all in 2027, well formed', () => {
  assert.ok(events.length > 40);
  for (let i = 1; i < events.length; i++) {
    assert.ok(Date.parse(events[i - 1].utc) <= Date.parse(events[i].utc), `order at ${i}`);
  }
  for (const e of events) {
    assert.match(e.utc, /^2027-\d\d-\d\dT\d\d:\d\d:00Z$/);
    assert.ok(['new', 'full', 'eclipse', 'station'].includes(e.type));
    assert.ok(e.deg >= 0 && e.deg < 30 && Number.isInteger(e.deg));
    assert.ok(typeof e.sign === 'string' && typeof e.detail === 'string');
  }
  const ecl = events.filter((e) => e.type === 'eclipse').map((e) => `${e.utc.slice(0, 10)} ${e.detail}`);
  assert.deepEqual(ecl, [
    '2027-02-06 annular solar eclipse', '2027-02-20 penumbral lunar eclipse',
    '2027-07-18 penumbral lunar eclipse', '2027-08-02 total solar eclipse',
    '2027-08-17 penumbral lunar eclipse',
  ]);
});

test('eventsByMonth in UTC: count per month equals the JSON', () => {
  const m = eventsByMonth(events, 'UTC');
  for (let k = 1; k <= 12; k++) {
    const want = events.filter((e) => +e.utc.slice(5, 7) === k).length;
    assert.equal(m.get(k).length, want, `month ${k}`);
  }
  assert.equal([...m.values()].reduce((s, a) => s + a.length, 0), events.length);
});

test('eventsByMonth keeps each month sorted by time', () => {
  for (const tz of ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
    for (const list of eventsByMonth(events, tz).values()) {
      for (let i = 1; i < list.length; i++) assert.ok(Date.parse(list[i - 1].utc) <= Date.parse(list[i].utc));
    }
  }
});

test('toLocal: Pacific/Auckland is on the next calendar day (NZDT, +13)', () => {
  // New moon 2027-01-07 20:24 UTC -> 2027-01-08 09:24 in Auckland (summer time)
  assert.deepEqual(toLocal('2027-01-07T20:24:00Z', 'Pacific/Auckland'),
    { date: '2027-01-08', time: '09:24', isoLocal: '2027-01-08T09:24+13:00' });
  // Same moment in UTC and Los Angeles (-8, standard time)
  assert.equal(toLocal('2027-01-07T20:24:00Z', 'UTC').date, '2027-01-07');
  assert.deepEqual(toLocal('2027-01-07T20:24:00Z', 'America/Los_Angeles'),
    { date: '2027-01-07', time: '12:24', isoLocal: '2027-01-07T12:24-08:00' });
  // Winter in New Zealand (NZST, +12)
  assert.equal(toLocal('2027-07-18T15:44:00Z', 'Pacific/Auckland').isoLocal, '2027-07-19T03:44+12:00');
  // India, half-hour offset
  assert.equal(toLocal('2027-01-07T20:24:00Z', 'Asia/Kolkata').isoLocal, '2027-01-08T01:54+05:30');
});

test('eventsByMonth moves the 31 Aug new moon into September in Auckland', () => {
  const nm = events.find((e) => e.type === 'new' && e.utc.startsWith('2027-08-31'));
  assert.ok(nm, 'new moon on 31 Aug UTC');
  assert.ok(eventsByMonth(events, 'UTC').get(8).includes(nm));
  const nz = eventsByMonth(events, 'Pacific/Auckland');
  assert.ok(!nz.get(8).includes(nm));
  assert.ok(nz.get(9).includes(nm));
  assert.equal([...nz.values()].reduce((s, a) => s + a.length, 0), events.length);
});

test('eventsByMonth puts events outside the year (in that zone) under 0 and 13', () => {
  const evs = [{ type: 'new', utc: '2027-01-01T03:00:00Z', sign: 'Capricorn', deg: 10, detail: 'new moon' },
    { type: 'full', utc: '2027-12-31T20:00:00Z', sign: 'Cancer', deg: 9, detail: 'full moon' }];
  const la = eventsByMonth(evs, 'America/Los_Angeles');
  assert.equal(la.get(0).length, 1);
  assert.equal(la.get(12).length, 1);
  const nz = eventsByMonth(evs, 'Pacific/Auckland');
  assert.equal(nz.get(1).length, 1);
  assert.equal(nz.get(13).length, 1);
});

test('eventTitle reads like the ebook', () => {
  assert.equal(eventTitle(events.find((e) => e.type === 'station' && e.planet === 'Mars')), 'Mars turns retrograde');
  assert.equal(eventTitle(events.find((e) => e.type === 'eclipse')), 'Annular solar eclipse');
  assert.equal(eventTitle(events[0]), 'New moon');
});

/** Unfold RFC 5545 lines. */
const unfold = (s) => s.replace(/\r\n[ \t]/g, '');

test('.ics: valid structure, CRLF, one VEVENT per event, UTC DTSTART', () => {
  const ics = makeIcs(events, 'Europe/Warsaw');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every newline is CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  const lines = unfold(ics).split('\r\n').filter(Boolean);
  assert.ok(lines.includes('VERSION:2.0'));
  assert.ok(lines.some((l) => l.startsWith('PRODID:')));
  assert.equal(lines.filter((l) => l === 'BEGIN:VEVENT').length, events.length);
  assert.equal(lines.filter((l) => l === 'END:VEVENT').length, events.length);
  const starts = lines.filter((l) => l.startsWith('DTSTART'));
  assert.equal(starts.length, events.length);
  assert.ok(starts.every((l) => /^DTSTART:2027\d{4}T\d{6}Z$/.test(l)));
  assert.equal(starts[0], 'DTSTART:20270107T202400Z');
  // BEGIN/END nest properly
  let depth = 0;
  for (const l of lines) {
    if (l.startsWith('BEGIN:')) depth++;
    if (l.startsWith('END:')) depth--;
    assert.ok(depth >= 0);
  }
  assert.equal(depth, 0);
  // local time of the reader's zone appears in the description
  assert.ok(lines.some((l) => l.startsWith('DESCRIPTION:') && l.includes('Europe/Warsaw') && l.includes('21:24')));
});

test('.ics: stable unique UIDs and escaped text', () => {
  const a = unfold(makeIcs(events, 'UTC')).split('\r\n').filter((l) => l.startsWith('UID:'));
  const b = unfold(makeIcs(events, 'Pacific/Auckland')).split('\r\n').filter((l) => l.startsWith('UID:'));
  assert.deepEqual(a, b, 'UID does not depend on the zone');
  assert.equal(new Set(a).size, events.length);
  const odd = [{ type: 'station', utc: '2027-05-08T12:56:00Z', sign: 'Aquarius', deg: 7, planet: 'Pluto',
    direction: 'retrograde', detail: 'a; b, c\\d\nnext' }];
  const ics = unfold(makeIcs(odd, 'UTC'));
  assert.ok(ics.includes('a\\; b\\, c\\\\d\\nnext'));
});
