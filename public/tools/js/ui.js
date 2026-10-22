// Chart worksheet page (/tools/chart/): form -> buildChart -> facts on screen -> PDFs.
// Everything runs in this browser. The only requests are the site's own files (city list,
// planet tables, conventions, PDF templates, libraries). Birth details stay in memory:
// no storage, no URL, no cookie, no analytics with input.

import { loadEphemeris } from './ephemeris.js';
import { buildChart } from './chart.js';
import { initForm, showError } from './chart-form.js';
import { renderChart } from './chart-view.js';

const $ = (id) => document.getElementById(id);
const CONV_URL = new URL('../data/conventions.json', import.meta.url).href;

let ready = null;
function loadData() {
  if (!ready) {
    ready = Promise.all([
      loadEphemeris(),
      fetch(CONV_URL).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    ]).then(([eph, conv]) => ({ eph, conv }));
    ready.catch(() => { ready = null; });
  }
  return ready;
}

let pdfModule = null;
const loadPdf = () => (pdfModule ||= import('./pdf.js').catch((e) => { pdfModule = null; throw e; }));

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Consent-gated (consent.js) generic event. No input values, only which tool was used.
function trackUse() {
  try { if (typeof window.cuTrack === 'function') window.cuTrack('tool_used', { tool: 'chart' }, true); } catch (e) { /* ignore */ }
}

function wirePdf(view, chart, ctx) {
  const run = async (btn, kind) => {
    const other = btn === view.editBtn ? view.printBtn : view.editBtn;
    btn.disabled = true; other.disabled = true;
    view.status.textContent = 'Making your PDF…';
    try {
      const pdf = await loadPdf();
      const notices = [];
      const opts = { birth: ctx.birth, notices };
      const bytes = kind === 'edit'
        ? await pdf.fillEditable(chart, ctx.name, opts)
        : await pdf.renderPrint(chart, ctx.name, opts);
      download(bytes, kind === 'edit' ? 'my-chart-worksheet.pdf' : 'my-chart-print.pdf');
      const done = kind === 'edit'
        ? 'Done. Look for my-chart-worksheet.pdf in your downloads.'
        : 'Done. Look for my-chart-print.pdf in your downloads.';
      view.status.textContent = [done, ...notices].join(' ');
    } catch (e) {
      view.status.textContent = 'Could not make the PDF. Check your connection and try again.';
    } finally {
      btn.disabled = false; other.disabled = false;
    }
  };
  view.editBtn.addEventListener('click', () => run(view.editBtn, 'edit'));
  view.printBtn.addEventListener('click', () => run(view.printBtn, 'print'));
}

async function show(got) {
  const go = $('go');
  go.disabled = true;
  $('status').textContent = 'Calculating your chart…';
  try {
    const { eph, conv } = await loadData();
    const chart = buildChart(got.input, eph, conv);
    const view = renderChart($('result'), chart, conv, got);
    wirePdf(view, chart, got);
    $('status').textContent = '';
    trackUse();
    $('result').querySelector('h2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('result').querySelector('.big3').setAttribute('tabindex', '-1');
    $('result').querySelector('.big3').focus({ preventScroll: true });
  } catch (e) {
    $('status').textContent = '';
    showError('Could not load the planet data. Check your connection and try again.');
  } finally {
    go.disabled = false;
  }
}

initForm({ onFirstUse: () => { loadData().catch(() => {}); }, onSubmit: show });
