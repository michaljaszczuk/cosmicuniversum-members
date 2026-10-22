// 2027 sky calendar page. Everything runs in the browser. The only network requests are the
// site's own static data files; notes and the chosen zone stay in this browser's localStorage.

import { toLocal, eventsByMonth, eventTitle, placeText, MONTHS } from './calendar.js';
import { makeIcs } from './ics.js';
import { loadCities, searchCities } from './places.js';

const DATA_URL = new URL('../data/calendar-2027.json', import.meta.url).href;
const YEAR = 2027;
const ZONE_KEY = 'cu_cal2027_zone';
const NOTE_KEY = (m) => `cu_cal2027_note_${m}`;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- storage (device only)

function store(key, value) {
  try {
    if (value === null || value === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch (e) { return false; }
}
function load(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

// ---------------------------------------------------------------- zone

function validZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; }
}

function detectedZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validZone(tz) ? tz : 'UTC';
  } catch (e) { return 'UTC'; }
}

const state = { events: [], carried: [], tz: 'UTC', label: '', month: 1, byMonth: new Map() };

function setZone(tz, label, remember = true) {
  state.tz = tz;
  state.label = label;
  state.byMonth = eventsByMonth(state.events, tz, YEAR);
  if (remember) store(ZONE_KEY, label === 'mine' ? null : JSON.stringify({ tz, label }));
  renderZone();
  renderMonth();
  renderYear();
}

function offsetText(isoLocal) {
  const m = isoLocal.match(/([+-])(\d\d):(\d\d)$/);
  if (!m) return 'UTC';
  if (m[2] === '00' && m[3] === '00') return 'UTC';
  return `UTC${m[1]}${+m[2]}${m[3] === '00' ? '' : `:${m[3]}`}`;
}

function renderZone() {
  const now = toLocal(new Date().toISOString(), state.tz);
  const who = state.label === 'mine' ? 'your time zone' : state.label;
  $('zone-now').innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = state.tz;
  $('zone-now').append('Times are shown for ', who === state.tz ? '' : `${who}: `, strong,
    ` (now ${offsetText(now.isoLocal)}). Summer time changes are included.`);
  $('use-mine').setAttribute('aria-pressed', String(state.label === 'mine'));
  $('use-utc').setAttribute('aria-pressed', String(state.tz === 'UTC' && state.label === 'UTC'));
}

// ---------------------------------------------------------------- event rendering

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

function symbol(e) {
  if (e.type === 'new') return '●';
  if (e.type === 'full') return '○';
  if (e.type === 'eclipse') return e.eclipse === 'solar' ? '◐' : '◑';
  return e.direction === 'retrograde' ? '℞' : 'D';
}

function whenText(e) {
  const l = toLocal(e.utc, state.tz);
  const [y, m, d] = l.date.split('-').map(Number);
  const day = dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
  return `${day}${y !== YEAR ? ` ${y}` : ''} · ${l.time} (${offsetText(l.isoLocal)})`;
}

function eventItem(e) {
  const li = document.createElement('li');
  if (e.type === 'eclipse') li.className = 'ecl';
  const sym = document.createElement('span');
  sym.className = 'sym';
  sym.setAttribute('aria-hidden', 'true');
  sym.textContent = symbol(e);
  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = `${eventTitle(e)} · ${placeText(e)}`;
  const when = document.createElement('span');
  when.className = 'when';
  const t = document.createElement('time');
  t.dateTime = e.utc;
  t.textContent = whenText(e);
  when.append(t);
  li.append(sym, what, when);
  return li;
}

function monthEvents(m) {
  const list = [...(state.byMonth.get(m) || [])];
  // events that slip into the neighbouring year in this zone stay visible at the ends
  if (m === 1) list.unshift(...(state.byMonth.get(0) || []));
  if (m === 12) list.push(...(state.byMonth.get(13) || []));
  return list;
}

function carriedText(m) {
  if (m !== 1 || !state.carried.length) return '';
  const names = state.carried.join(' and ');
  return `${names} ${state.carried.length > 1 ? 'are' : 'is'} already retrograde as 2027 begins.`;
}

function renderMonth() {
  if (noteTimer) saveNote(); // keep a half-typed note with its own month
  const m = state.month;
  $('month-h').textContent = `${MONTHS[m - 1]} ${YEAR}`;
  $('prev').disabled = m === 1;
  $('next').disabled = m === 12;
  $('month-note-out').textContent = carriedText(m);
  const ol = $('month-events');
  ol.replaceChildren();
  const list = monthEvents(m);
  if (!list.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="empty">No events this month.</span>';
    ol.append(li);
  }
  for (const e of list) ol.append(eventItem(e));
  if (!list.some((e) => e.type === 'station') && list.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="empty">No planet stations this month.</span>';
    ol.append(li);
  }
  $('note-month').textContent = MONTHS[m - 1];
  $('note').value = load(NOTE_KEY(m)) || '';
  noteMonth = m;
  $('note-status').textContent = 'Saved only on this device. It is never sent anywhere.';
  for (const card of document.querySelectorAll('.year .m')) {
    card.classList.toggle('current', +card.dataset.month === m);
  }
}

function renderYear() {
  const wrap = $('year');
  wrap.replaceChildren();
  for (let m = 1; m <= 12; m++) {
    const card = document.createElement('section');
    card.className = 'm';
    card.dataset.month = String(m);
    if (m === state.month) card.classList.add('current');
    const h = document.createElement('h3');
    const b = document.createElement('button');
    b.type = 'button';
    const list = monthEvents(m);
    const name = document.createElement('span');
    name.textContent = MONTHS[m - 1];
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${list.length} events · open`;
    b.append(name, count);
    b.setAttribute('aria-label', `${MONTHS[m - 1]}: ${list.length} events. Open this month above.`);
    b.addEventListener('click', () => {
      state.month = m;
      renderMonth();
      $('month-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('month-h').focus({ preventScroll: true });
    });
    h.append(b);
    const ol = document.createElement('ol');
    ol.className = 'events';
    for (const e of list) ol.append(eventItem(e));
    const extra = carriedText(m);
    card.append(h, ol);
    if (extra) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.style.padding = '0 14px 10px';
      p.textContent = extra;
      card.append(p);
    }
    wrap.append(card);
  }
}

// ---------------------------------------------------------------- notes

let noteTimer = null;
let noteMonth = 0; // month whose note is in the text box
function saveNote() {
  clearTimeout(noteTimer);
  noteTimer = null;
  if (!noteMonth) return;
  const ok = store(NOTE_KEY(noteMonth), $('note').value);
  $('note-status').textContent = ok
    ? 'Saved on this device only. It is never sent anywhere.'
    : 'Could not save here (private browsing or storage turned off). Copy your note somewhere safe.';
}

// ---------------------------------------------------------------- city picker

let results = [];
let active = -1;

function closeList() {
  $('city-list').hidden = true;
  $('city').setAttribute('aria-expanded', 'false');
  $('city').removeAttribute('aria-activedescendant');
  active = -1;
}

function showResults() {
  const ul = $('city-list');
  ul.replaceChildren();
  results.forEach((c, i) => {
    const li = document.createElement('li');
    li.id = `city-opt-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === active));
    li.textContent = `${c.name}, ${c.country}`;
    const tz = document.createElement('span');
    tz.className = 'tz';
    tz.textContent = c.tz;
    li.append(tz);
    li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(i); });
    ul.append(li);
  });
  ul.hidden = results.length === 0;
  $('city').setAttribute('aria-expanded', String(results.length > 0));
  if (active >= 0) $('city').setAttribute('aria-activedescendant', `city-opt-${active}`);
  else $('city').removeAttribute('aria-activedescendant');
}

function choose(i) {
  const c = results[i];
  if (!c) return;
  closeList();
  $('city').value = `${c.name}, ${c.country}`;
  $('city-status').textContent = `Showing times for ${c.name}.`;
  setZone(c.tz, `${c.name}, ${c.country}`);
}

let citiesReady = null;
function ensureCities() {
  if (!citiesReady) {
    $('city-status').textContent = 'Loading cities…';
    citiesReady = loadCities().then(() => { $('city-status').textContent = ''; })
      .catch(() => {
        citiesReady = null;
        $('city-status').textContent = 'Could not load the city list. Check your connection and try again.';
      });
  }
  return citiesReady;
}

function wireCityPicker() {
  const input = $('city');
  input.addEventListener('focus', ensureCities);
  input.addEventListener('input', async () => {
    await ensureCities();
    results = searchCities(input.value);
    active = results.length ? 0 : -1;
    showResults();
    if (input.value.trim() && !results.length) $('city-status').textContent = 'No city found. Try another spelling.';
    else if (results.length) $('city-status').textContent = `${results.length} cities found. Use the arrow keys and Enter.`;
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && results.length) { active = (active + 1) % results.length; showResults(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp' && results.length) { active = (active - 1 + results.length) % results.length; showResults(); ev.preventDefault(); }
    else if (ev.key === 'Enter' && active >= 0) { choose(active); ev.preventDefault(); }
    else if (ev.key === 'Escape') closeList();
  });
  input.addEventListener('blur', () => setTimeout(closeList, 100));
}

// ---------------------------------------------------------------- .ics

function downloadIcs() {
  const text = makeIcs(state.events, state.tz);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sky-calendar-2027.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- start

function startMonth() {
  const [y, m] = toLocal(new Date().toISOString(), state.tz).date.split('-').map(Number);
  if (y < YEAR) return 1;
  if (y > YEAR) return 12;
  return m;
}

async function main() {
  $('month-h').tabIndex = -1;
  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (e) {
    $('zone-now').textContent = 'The calendar data could not be loaded. Please reload the page.';
    return;
  }
  state.events = data.events;
  state.carried = data.retrogradeAtStart || [];

  let saved = null;
  try { saved = JSON.parse(load(ZONE_KEY) || 'null'); } catch (e) { saved = null; }
  if (saved && validZone(saved.tz) && typeof saved.label === 'string') {
    state.tz = saved.tz; state.label = saved.label;
  } else {
    state.tz = detectedZone(); state.label = 'mine';
  }
  state.month = startMonth();
  setZone(state.tz, state.label, false);

  $('prev').addEventListener('click', () => { if (state.month > 1) { state.month--; renderMonth(); } });
  $('next').addEventListener('click', () => { if (state.month < 12) { state.month++; renderMonth(); } });
  $('use-mine').addEventListener('click', () => {
    $('city').value = ''; $('city-status').textContent = '';
    setZone(detectedZone(), 'mine');
  });
  $('use-utc').addEventListener('click', () => {
    $('city').value = ''; $('city-status').textContent = '';
    setZone('UTC', 'UTC');
  });
  $('note').addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveNote, 400); });
  $('note').addEventListener('blur', saveNote);
  $('ics').addEventListener('click', downloadIcs);
  wireCityPicker();
}

main();
