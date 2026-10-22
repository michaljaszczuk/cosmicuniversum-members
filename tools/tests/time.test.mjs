import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localToUtc, manualOffsetToUtc, jdFromDate } from '../../public/tools/js/time.js';

const charts = JSON.parse(readFileSync(new URL('./oracle/charts.json', import.meta.url), 'utf8'));
const W = 'Europe/Warsaw';

test('spring-forward gap is missing', () => {
  const r = localToUtc({ y: 2027, m: 3, d: 28, h: 2, mi: 30 }, W);
  assert.equal(r.status, 'missing');
  assert.equal(r.utc, undefined);
});

test('fall-back overlap is ambiguous with two options, DST side first', () => {
  const r = localToUtc({ y: 2027, m: 10, d: 31, h: 2, mi: 30 }, W);
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(r.options.map((d) => d.toISOString()),
    ['2027-10-31T00:30:00.000Z', '2027-10-31T01:30:00.000Z']);
});

test('Warsaw summer 1985-07-01 12:00 -> 10:00 UTC', () => {
  const r = localToUtc({ y: 1985, m: 7, d: 1, h: 12, mi: 0 }, W);
  assert.equal(r.status, 'ok');
  assert.equal(r.utc.toISOString(), '1985-07-01T10:00:00.000Z');
});

test('Warsaw winter 1990-01-15 12:00 -> 11:00 UTC', () => {
  const r = localToUtc({ y: 1990, m: 1, d: 15, h: 12, mi: 0 }, W);
  assert.equal(r.utc.toISOString(), '1990-01-15T11:00:00.000Z');
});

test('manual offset', () => {
  assert.equal(manualOffsetToUtc({ y: 2000, m: 1, d: 1, h: 12, mi: 0 }, 330).toISOString(),
    '2000-01-01T06:30:00.000Z');
});

test('jdFromDate J2000', () => {
  assert.equal(jdFromDate(new Date('2000-01-01T12:00:00Z')), 2451545.0);
  assert.equal(jdFromDate(new Date('1970-01-01T00:00:00Z')), 2440587.5);
});

test('every oracle chart: localToUtc agrees with oracle utc (or flags DST edge)', () => {
  let ok = 0, edge = 0;
  for (const c of charts) {
    const { local, tz, utc } = c.input;
    if (!local) continue;
    const m = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(local);
    const l = { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
    const r = localToUtc(l, tz);
    if (r.status === 'ok') {
      assert.equal(r.utc.getTime(), new Date(utc).getTime(), `${local} ${tz}`);
      ok++;
    } else if (r.status === 'ambiguous') {
      assert.ok(r.options.some((d) => d.getTime() === new Date(utc).getTime()), `${local} ${tz} ambiguous`);
      edge++;
    } else {
      edge++; // missing: oracle utc is whatever convention it chose
    }
  }
  assert.ok(ok > 200);
  // 12 DST-edge cases exist; Europe/Warsaw 1980-04-06 02:30 is not a gap in current tzdata
  // (the switch was at 00:00Z), and both ICU and the oracle agree it is 'ok' at 00:30Z.
  assert.equal(edge, 11);
});
