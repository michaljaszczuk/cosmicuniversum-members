// Pure logic of the report order form (public/report/js/order-form.js). Demo person only.
// Run: node --test tools/tests/report-order-form.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFields, timeMessage, buildPayload, placeProblem, waitlistBody, NO_TIME_TEXT, NAME_TEXT } from '../../public/report/js/order-form.js';

const place = { name: 'Kraków', country: 'PL', admin1: 'Lesser Poland', lat: 50.061, lon: 19.937, tz: 'Europe/Warsaw' };
const good = () => ({
  name: 'Alex', email: 'alex@example.com', date: '1990-03-14', time: '08:30', noTime: false, fold: null, place,
  timeSource: 'record', sure: 15, needsRisk: false, riskAccepted: false, consentPrivacy: true, consentWaiver: true,
});
const fields = (f) => checkFields(f).map((e) => e.field);

test('a complete form has no errors', () => assert.deepEqual(checkFields(good()), []));

test('no birth time stops the order with the needs-a-time text', () => {
  const e = checkFields({ ...good(), noTime: true });
  assert.deepEqual(e, [{ field: 'time', error: NO_TIME_TEXT }]);
  assert.match(NO_TIME_TEXT, /needs a birth time/);
  assert.deepEqual(fields({ ...good(), time: '' }), ['time']);
});

test('each missing part is named', () => {
  assert.deepEqual(fields({ ...good(), name: ' ' }), ['name']);
  assert.deepEqual(fields({ ...good(), email: 'x' }), ['email']);
  assert.deepEqual(fields({ ...good(), date: '1990-02-30' }), ['date']);
  assert.deepEqual(fields({ ...good(), place: null }), ['place']);
  assert.deepEqual(fields({ ...good(), timeSource: '' }), ['timeSource']);
  assert.deepEqual(fields({ ...good(), sure: null }), ['sure']);
  assert.deepEqual(fields({ ...good(), consentPrivacy: false, consentWaiver: false }), ['consentPrivacy', 'consentWaiver']);
});

test('unsafe time needs the extra tick', () => {
  assert.deepEqual(fields({ ...good(), needsRisk: true }), ['riskAccepted']);
  assert.deepEqual(fields({ ...good(), needsRisk: true, riskAccepted: true }), []);
});

const w = {
  rising: 'Aries', moon: 'Leo', mc: 'Capricorn',
  from: new Date('1990-03-14T06:40:00Z'), to: new Date('1990-03-14T07:50:00Z'), fromCause: 'Rising', toCause: 'Moon',
};
const utc = new Date('1990-03-14T07:30:00Z');

test('safe time: the exact text from the spec', () => {
  assert.deepEqual(timeMessage(w, utc, 15, 'Europe/Warsaw', '1990-03-14'),
    { safe: true, blocked: false, text: 'Your Rising sign stays Aries from 07:40 to 08:50. Your time is safe.' });
});

test('unsafe time names the part that changes and when', () => {
  const m = timeMessage(w, utc, 30, 'Europe/Warsaw', '1990-03-14');
  assert.equal(m.safe, false);
  assert.match(m.text, /Moon sign/);
  assert.match(m.text, /08:50/);
  assert.match(m.text, /check your birth time/);
});

test('unsafe on the early side uses the start time', () => {
  const m = timeMessage({ ...w, from: new Date('1990-03-14T07:20:00Z') }, utc, 15, 'Europe/Warsaw', '1990-03-14');
  assert.match(m.text, /Rising sign/);
  assert.match(m.text, /08:20/);
});

test('no window (far north) blocks the order', () => {
  const m = timeMessage(null, utc, 15, 'Europe/Warsaw', '1990-03-14');
  assert.equal(m.blocked, true);
  assert.match(m.text, /far north or south/);
});

test('buildPayload sends only what the server reads', () => {
  const p = buildPayload({ ...good(), needsRisk: true, riskAccepted: true }, 'tok');
  assert.deepEqual(p, {
    name: 'Alex', email: 'alex@example.com', date: '1990-03-14', time: '08:30', fold: null,
    place: { name: 'Kraków', country: 'PL', lat: 50.061, lon: 19.937 },
    timeSource: 'record', sure: 15, riskAccepted: true, consentPrivacy: true, consentWaiver: true, turnstile: 'tok',
  });
  assert.equal(buildPayload({ ...good(), fold: 1 }, 't').fold, 1);
});

test('a town past 66 degrees is refused as soon as it is picked', () => {
  const north = { ...place, name: 'Rovaniemi', country: 'FI', lat: 66.5, lon: 25.7, tz: 'Europe/Helsinki' };
  const south = { ...north, lat: -66.2 };
  assert.match(placeProblem(north), /far north or south/);
  assert.match(placeProblem(south), /far north or south/);
  assert.equal(placeProblem(place), null);
  assert.equal(placeProblem({ ...place, lat: 66 }), null);
  assert.deepEqual(fields({ ...good(), place: north }), ['place']);
});

test('waitlistBody: far-north list carries the town, no-time list does not', () => {
  const north = { ...place, name: 'Rovaniemi', admin1: 'Lapland', country: 'FI', lat: 66.5 };
  assert.deepEqual(waitlistBody(' p@example.com ', 'polar', north, 'tok'),
    { email: 'p@example.com', consent: true, list: 'polar', town: 'Rovaniemi, Lapland, FI', turnstile: 'tok' });
  assert.deepEqual(waitlistBody('w@example.com', 'notime', north, 'tok'),
    { email: 'w@example.com', consent: true, list: 'notime', turnstile: 'tok' });
});

test('names with special letters pass, other alphabets and symbols get the name text', () => {
  for (const name of ['Paweł', 'Zoë O’Brien-Łącka', 'Михаил', 'Μιχάλης']) assert.deepEqual(fields({ ...good(), name }), [], name);
  for (const name of ['李明', 'Alex 😀', 'Al<b>ex']) assert.deepEqual(checkFields({ ...good(), name }), [{ field: 'name', error: NAME_TEXT }], name);
});
