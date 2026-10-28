// Report order form: pure checks and texts (no DOM). The server checks everything again
// (functions/_shared/order-check.js). All customer texts wait for owner approval.
import { checkDate } from '../../tools/js/input.js';
import { fitsWindow, clockText } from '../../tools/js/timewindow.js';

export const NO_TIME_TEXT = 'This report needs a birth time, at least roughly. Without one, your Rising sign and houses are unknown.';
const PART = { Rising: 'Rising sign', Moon: 'Moon sign', Midheaven: 'Midheaven sign' };

/** @returns {{field: string, error: string}[]} in form order; empty when the form is complete */
export function checkFields(f) {
  const out = [];
  const add = (field, error) => out.push({ field, error });
  if (!String(f.name || '').trim()) add('name', 'Enter the name to print on your report.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(f.email || '').trim())) add('email', 'Enter a working email address. Your report goes there.');
  const d = checkDate(f.date);
  if (!d.ok) add('date', d.error);
  if (f.noTime || !/^\d\d:\d\d$/.test(String(f.time || ''))) {
    if (f.noTime) return [{ field: 'time', error: NO_TIME_TEXT }];
    add('time', 'Enter your birth time as hours and minutes.');
  }
  if (!f.place) add('place', 'Pick your birth town from the list.');
  if (!['record', 'parent', 'guess'].includes(f.timeSource)) add('timeSource', 'Tell us where your birth time comes from.');
  if (![0, 15, 30, 60].includes(f.sure)) add('sure', 'Tell us how sure you are of your birth time.');
  if (f.needsRisk && !f.riskAccepted) add('riskAccepted', 'Please check your birth time, or tick the box to order anyway.');
  if (!f.consentPrivacy) add('consentPrivacy', 'Please tick the privacy box. We need it to make your report.');
  if (!f.consentWaiver) add('consentWaiver', 'Please tick the box about getting your report now.');
  return out;
}

/**
 * Text under the time fields. w = timeWindow(...) or null.
 * @returns {{safe: boolean, blocked: boolean, text: string}}
 */
export function timeMessage(w, utc, sure, tz, date) {
  if (!w) return { safe: false, blocked: true, text: "We can't make this report for places this far north or south yet." };
  const clock = (d) => clockText(d, tz, date);
  if (fitsWindow(w, utc, sure)) {
    return { safe: true, blocked: false, text: `Your Rising sign stays ${w.rising} from ${clock(w.from)} to ${clock(w.to)}. Your time is safe.` };
  }
  const early = utc.getTime() - sure * 60000 < w.from.getTime();
  const cause = early ? w.fromCause : w.toCause;
  const sign = { Rising: w.rising, Moon: w.moon, Midheaven: w.mc }[cause] ?? w.rising;
  const at = clock(early ? w.from : w.to);
  return {
    safe: false, blocked: false,
    text: `Your ${PART[cause] ?? 'Rising sign'} can change near your birth time. It is ${sign} only ${early ? 'from' : 'until'} ${at}, `
      + `and your time may be up to ${sure} minutes off. Please check your birth time.`,
  };
}

/** The JSON body for POST /api/report/order. */
export function buildPayload(f, turnstile) {
  return {
    name: String(f.name).trim(), email: String(f.email).trim(), date: f.date, time: f.time, fold: f.fold ?? null,
    place: { name: f.place.name, country: f.place.country, lat: f.place.lat, lon: f.place.lon },
    timeSource: f.timeSource, sure: f.sure, riskAccepted: !!f.riskAccepted,
    consentPrivacy: f.consentPrivacy === true, consentWaiver: f.consentWaiver === true, turnstile,
  };
}
