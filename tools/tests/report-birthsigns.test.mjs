// Birth rune and life path maths for the paid report (tools/report/birthsigns.mjs).
// Run: node --test tools/tests/report-birthsigns.test.mjs
// Uses made-up dates only, never real birth data. Expected values are worked out by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RUNES, birthRune, lifePath } from '../report/birthsigns.mjs';

test('known birth runes', () => {
  assert.equal(birthRune(6, 29).rune, 'Fehu');
  assert.equal(birthRune(10, 1).rune, 'Gebo');
  assert.equal(birthRune(2, 12).rune, 'Sowilo');
  assert.equal(birthRune(6, 28).rune, 'Dagaz');
  assert.equal(birthRune(12, 31).rune, 'Eihwaz');
  assert.equal(birthRune(1, 1).rune, 'Eihwaz');
  assert.equal(birthRune(2, 29).rune, 'Tiwaz');
  assert.deepEqual([birthRune(10, 1).from, birthRune(10, 1).to], ['09-28', '10-12']);
  assert.deepEqual([birthRune(1, 1).from, birthRune(1, 1).to], ['12-28', '01-12']);
});

test('every day of a leap year has exactly one rune, each rune 14-17 days', () => {
  const count = {};
  for (let t = Date.UTC(2000, 0, 1); t <= Date.UTC(2000, 11, 31); t += 86400000) {
    const d = new Date(t);
    const { rune } = birthRune(d.getUTCMonth() + 1, d.getUTCDate());
    count[rune] = (count[rune] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(count).sort(), [...RUNES].sort());
  assert.equal(RUNES.length, 24);
  for (const [rune, n] of Object.entries(count)) assert.ok(n >= 14 && n <= 17, `${rune}: ${n} days`);
  assert.equal(Object.values(count).reduce((a, b) => a + b), 366);
});

test('edge line where the Vogue table differs', () => {
  assert.equal(birthRune(10, 1).edge, null);
  assert.deepEqual(birthRune(9, 28).edge, { other: ['Kenaz'] }); // Vogue: Kenaz or Gebo
  assert.deepEqual(birthRune(3, 14).edge, { other: ['Tiwaz'] }); // demo chart date
  assert.deepEqual(birthRune(2, 12).edge, { other: ['Algiz'] }); // Vogue: Algiz to 13 Feb
  assert.deepEqual(birthRune(2, 13).edge, { other: ['Algiz'] });
  assert.equal(birthRune(2, 26).edge, null); // Vogue: Sowilo to 27 Feb
});

test('life path, reduce-parts', () => {
  assert.deepEqual(lifePath(1973, 10, 1),
    { number: 4, steps: { month: 1, day: 1, year: 2 }, sum: 4, method: 'reduce-parts' });
  assert.equal(lifePath(1990, 3, 14).number, 9); // 3 + 5 + 1
  assert.deepEqual(lifePath(2000, 2, 29).steps, { month: 2, day: 11, year: 2 });
  assert.equal(lifePath(2009, 11, 29).number, 33); // 11 + 11 + 11
  assert.equal(lifePath(1999, 9, 2).number, 3); // 9 + 2 + 1 = 12 -> 3
  assert.equal(lifePath(2000, 2, 29).number, 6); // 2 + 11 + 2 = 15 -> 6
  assert.equal(lifePath(2000, 1, 8).number, 11); // 1 + 8 + 2 = 11, kept
  assert.equal(lifePath(2000, 11, 9).number, 22); // 11 + 9 + 2 = 22, kept
  assert.equal(lifePath(1984, 4, 13).number, 3); // 1984 -> 22 kept; 4 + 4 + 22 = 30 -> 3
});
