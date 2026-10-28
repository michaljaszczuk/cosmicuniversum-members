// Report order form: DOM glue. Logic and texts are in order-form.js; the server checks again.
import { searchPlaces } from './places.js';
import { checkFields, timeMessage, buildPayload } from './order-form.js';
import { loadEphemeris } from '../../tools/js/ephemeris.js';
import { localToUtc } from '../../tools/js/time.js';
import { timeWindow } from '../../tools/js/timewindow.js';
import { formatDate } from '../../tools/js/input.js';

const SITEKEY = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? '1x00000000000000000000AA' // Cloudflare's always-pass test key
  : '0x4AAAAAAFWozKNzpEypoZFk';
const $ = (id) => document.getElementById(id);
const radio = (name) => document.querySelector(`input[name=${name}]:checked`)?.value ?? null;
const state = { place: null, needsRisk: false, ambiguous: false };
let turnstileToken = '';
let widget = null;

function renderTurnstile() {
  if (!window.turnstile) { setTimeout(renderTurnstile, 200); return; }
  widget = window.turnstile.render('#turnstile', {
    sitekey: SITEKEY,
    callback: (t) => { turnstileToken = t; },
    'expired-callback': () => { turnstileToken = ''; },
  });
}
function freshToken() {
  const t = turnstileToken;
  turnstileToken = '';
  if (widget !== null) window.turnstile.reset(widget);
  return t;
}

function fields() {
  const sure = radio('sure');
  const fold = radio('fold');
  return {
    name: $('name').value, email: $('email').value, date: $('date').value, time: $('time').value,
    noTime: $('no-time').checked, fold: state.ambiguous && fold !== null ? +fold : null, place: state.place,
    timeSource: radio('timeSource') ?? '', sure: sure === null ? null : +sure,
    needsRisk: state.needsRisk, riskAccepted: $('risk').checked,
    consentPrivacy: $('consent-privacy').checked, consentWaiver: $('consent-waiver').checked,
  };
}

function showErrors(errors) {
  for (const el of document.querySelectorAll('.field-error')) el.hidden = true;
  for (const e of errors) {
    const el = $(`${e.field}-error`);
    if (el) { el.textContent = e.error; el.hidden = false; }
  }
  if (errors.length) $(`${errors[0].field}-error`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ----- town search -----
let searchSeq = 0;
$('city').addEventListener('input', async () => {
  state.place = null;
  updateTimeCheck();
  const q = $('city').value;
  const seq = ++searchSeq;
  let list = [];
  try { list = await searchPlaces(q); } catch { list = []; }
  if (seq !== searchSeq) return;
  const ul = $('city-list');
  ul.replaceChildren(...list.map((p, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = `city-${i}`;
    li.textContent = p.name;
    const sub = document.createElement('span');
    sub.className = 'tz';
    sub.textContent = [p.admin1, p.country, p.tz].filter(Boolean).join(' · ');
    li.append(sub);
    li.addEventListener('click', () => pickTown(p));
    return li;
  }));
  ul.hidden = list.length === 0;
  $('city').setAttribute('aria-expanded', String(list.length > 0));
});
function pickTown(p) {
  state.place = p;
  $('city').value = [p.name, p.admin1, p.country].filter(Boolean).join(', ');
  $('city-list').hidden = true;
  $('city').setAttribute('aria-expanded', 'false');
  updateTimeCheck();
}

// ----- no birth time -----
$('no-time').addEventListener('change', () => {
  const none = $('no-time').checked;
  $('time').disabled = none;
  $('waitlist').hidden = !none;
  $('time-parts').hidden = none;
  $('go').disabled = none;
  updateTimeCheck();
});
$('wl-go').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('wl-status').textContent = 'Enter your email above first.'; return; }
  if (!$('wl-consent').checked) { $('wl-status').textContent = 'Please tick the box first.'; return; }
  $('wl-go').disabled = true;
  const res = await fetch('/api/report/waitlist', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, consent: true, turnstile: freshToken() }),
  }).catch(() => null);
  $('wl-go').disabled = false;
  const data = res ? await res.json().catch(() => ({})) : {};
  $('wl-status').textContent = res?.ok ? 'Thank you. We will email you when it exists.' : (data.error || 'Something went wrong. Please try again.');
});

// ----- birth time safety check -----
let ephPromise = null;
async function updateTimeCheck() {
  const box = $('time-check');
  const f = fields();
  state.ambiguous = false;
  $('fold').hidden = true;
  if (f.noTime || !f.place || !/^\d{4}-\d\d-\d\d$/.test(f.date) || !/^\d\d:\d\d$/.test(f.time) || f.sure === null) {
    box.hidden = true;
    state.needsRisk = false;
    return;
  }
  const [y, m, d] = f.date.split('-').map(Number);
  const [h, mi] = f.time.split(':').map(Number);
  const r = localToUtc({ y, m, d, h, mi }, f.place.tz);
  let utc;
  if (r.status === 'missing') {
    showErrors([{ field: 'time', error: 'In this place the clocks moved forward on this date, so this time did not exist. Check your birth time.' }]);
    box.hidden = true;
    return;
  } else if (r.status === 'ambiguous') {
    state.ambiguous = true;
    $('fold').hidden = false;
    const fold = radio('fold');
    if (fold === null) { box.hidden = true; return; }
    utc = r.options[+fold];
  } else {
    utc = r.utc;
  }
  ephPromise ??= loadEphemeris();
  const eph = await ephPromise;
  const msg = timeMessage(timeWindow({ utc, lat: f.place.lat, lon: f.place.lon }, eph), utc, f.sure, f.place.tz, f.date);
  $('time-check-text').textContent = msg.text;
  box.classList.toggle('safe', msg.safe);
  $('risk-box').hidden = msg.safe || msg.blocked;
  state.needsRisk = !msg.safe && !msg.blocked;
  $('go').disabled = msg.blocked;
  box.hidden = false;
}
for (const id of ['date', 'time']) $(id).addEventListener('change', updateTimeCheck);
for (const el of document.querySelectorAll('input[name=sure], input[name=fold]')) el.addEventListener('change', updateTimeCheck);

// ----- "Is this right?" and payment -----
$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = fields();
  const errors = checkFields(f);
  if (state.ambiguous && f.fold === null) errors.push({ field: 'fold', error: 'Pick the first or the second time.' });
  showErrors(errors);
  if (errors.length) return;
  const [y, m, d] = f.date.split('-').map(Number);
  const rows = [
    ['Name', f.name.trim()], ['Email', f.email.trim()], ['Birth date', formatDate({ y, m, d })],
    ['Birth time', f.time + (f.fold === null ? '' : f.fold === 0 ? ' (the first one)' : ' (the second one)')],
    ['Birth town', [f.place.name, f.place.admin1].filter(Boolean).join(', ')], ['Country', f.place.country],
    ['Time zone', f.place.tz],
  ];
  $('summary-list').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  $('form').hidden = true;
  $('summary').hidden = false;
  $('summary').focus();
});
$('edit').addEventListener('click', () => { $('summary').hidden = true; $('form').hidden = false; });
$('pay').addEventListener('click', async () => {
  $('pay').disabled = true;
  $('pay-error').hidden = true;
  const token = freshToken();
  if (!token) {
    $('pay').disabled = false;
    $('pay-error').textContent = 'The robot check is not finished yet. Go back, wait a moment, and try again.';
    $('pay-error').hidden = false;
    return;
  }
  const res = await fetch('/api/report/order', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildPayload(fields(), token)),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (res?.ok && data.pay) { location.href = data.pay; return; }
  $('pay').disabled = false;
  $('summary').hidden = true;
  $('form').hidden = false;
  showErrors([{ field: data.field || 'error', error: data.error || 'Something went wrong. Please try again.' }]);
  if (!data.field || !$(`${data.field}-error`)) { $('error').textContent = data.error || 'Something went wrong. Please try again.'; $('error').hidden = false; }
});

renderTurnstile();
