// Chart page form: city picker, input checks, clock-change choice.
// Privacy: values stay in memory. No storage, no URL, no request carries them.

import { loadCities, searchCities } from './places.js';
import { localToUtc, manualOffsetToUtc } from './time.js';
import {
  checkDateInput, checkTime, checkOffset, resolveBirth, formatDate, formatTime,
} from './input.js';

const $ = (id) => document.getElementById(id);
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* old browser */ }
export const countryName = (code) => {
  try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
};

const state = { city: null, choice: null, choiceKey: '' };

// ---------------------------------------------------------------- errors

export function showError(msg, focusId) {
  const el = $('error');
  el.textContent = msg;
  el.hidden = !msg;
  if (msg && focusId) $(focusId).focus();
}

// ---------------------------------------------------------------- city picker

let results = [];
let active = -1;
let citiesReady = null;

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
    li.textContent = `${c.name}, ${countryName(c.country)}`;
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
  state.city = c;
  $('city').value = `${c.name}, ${countryName(c.country)}`;
  $('city-status').textContent = `${c.name}: latitude ${c.lat.toFixed(2)}, longitude ${c.lon.toFixed(2)}, time zone ${c.tz}.`;
}

function ensureCities() {
  if (!citiesReady) {
    $('city-status').textContent = 'Loading the city list…';
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
    state.city = null;
    await ensureCities();
    results = searchCities(input.value);
    active = results.length ? 0 : -1;
    showResults();
    if (input.value.trim() && !results.length) $('city-status').textContent = 'No city found. Try another spelling, or pick the nearest larger city in the same time zone.';
    else if (results.length) $('city-status').textContent = `${results.length} ${results.length === 1 ? 'city' : 'cities'} found. Use the arrow keys and Enter, or tap a city.`;
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && results.length) { active = (active + 1) % results.length; showResults(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp' && results.length) { active = (active - 1 + results.length) % results.length; showResults(); ev.preventDefault(); }
    else if (ev.key === 'Enter' && active >= 0 && !$('city-list').hidden) { choose(active); ev.preventDefault(); }
    else if (ev.key === 'Escape') closeList();
  });
  input.addEventListener('blur', () => setTimeout(closeList, 100));
}

// ---------------------------------------------------------------- clock-change choice

function showChoice(options, t) {
  const box = $('choice');
  box.replaceChildren();
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = `Which ${formatTime(t)} is your birth time?`;
  const p = document.createElement('p');
  p.textContent = `On this date the clocks in this place went back one hour, so ${formatTime(t)} happened two times. If you do not know which one, ask the person who has your birth record.`;
  fs.append(legend, p);
  options.forEach((o, i) => {
    const label = document.createElement('label');
    label.className = 'check';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = 'dst-choice'; // radio group only; this form never submits
    r.value = String(i);
    r.addEventListener('change', () => { state.choice = i; });
    label.append(r, ` ${i === 0 ? 'The first' : 'The second'} ${formatTime(t)} (${o.offset}, ${i === 0 ? 'before' : 'after'} the clocks went back)`);
    fs.append(label);
  });
  box.append(fs);
  box.hidden = false;
  fs.querySelector('input').focus();
}

function clearChoice() {
  state.choice = null;
  state.choiceKey = '';
  $('choice').hidden = true;
  $('choice').replaceChildren();
}

// ---------------------------------------------------------------- read the form

/**
 * @returns {null | {input:{utc,lat,lon,hasTime,tz}, birth:{date,time,place}, name:string}}
 *   null when there is an error or a choice to make (shown on the page).
 */
export function collect() {
  showError('');
  const d = checkDateInput($('date').value, !!($('date').validity && $('date').validity.badInput));
  if (!d.ok) { showError(d.error, 'date'); return null; }
  const hasTime = !$('no-time').checked;
  let t = null;
  if (hasTime) {
    const tc = checkTime($('time').value);
    if (!tc.ok) { showError(tc.error, 'time'); return null; }
    t = tc.value;
  }
  const c = state.city;
  if (!c) { showError('Pick your birth place from the city list.', 'city'); return null; }
  let offsetMinutes = null;
  const off = $('offset').value.trim();
  if (off) {
    const o = checkOffset(off);
    if (!o.ok) { $('offset').closest('details').open = true; showError(o.error, 'offset'); return null; }
    offsetMinutes = o.minutes;
  }

  const r = resolveBirth({ date: d.value, time: t, tz: c.tz, offsetMinutes }, localToUtc, manualOffsetToUtc);
  if (r.status === 'missing') { clearChoice(); showError(r.error, 'time'); return null; }
  let utc = r.utc;
  if (r.status === 'ambiguous') {
    const key = `${$('date').value} ${$('time').value} ${c.tz}`;
    if (state.choiceKey !== key) {
      clearChoice();
      state.choiceKey = key;
      showChoice(r.options, t);
      showError('Choose one of the two times above, then press the button again.');
      return null;
    }
    if (state.choice === null) { showError('Choose one of the two times above, then press the button again.'); return null; }
    utc = r.options[state.choice].utc;
  } else {
    clearChoice();
  }

  return {
    input: { utc, lat: c.lat, lon: c.lon, hasTime, tz: c.tz },
    birth: {
      date: formatDate(d.value),
      time: t ? formatTime(t) : '',
      place: `${c.name}, ${countryName(c.country)}`,
    },
    name: $('name').value.trim(),
  };
}

/** Wire the form. onFirstUse: start loading data; onSubmit: called with collect() result. */
export function initForm({ onFirstUse, onSubmit }) {
  wireCityPicker();
  const form = $('form');
  form.addEventListener('focusin', onFirstUse, { once: true });
  $('no-time').addEventListener('change', () => {
    $('time').disabled = $('no-time').checked;
    clearChoice();
  });
  for (const id of ['date', 'time']) $(id).addEventListener('change', clearChoice);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const got = collect();
    if (got) onSubmit(got);
  });
}
