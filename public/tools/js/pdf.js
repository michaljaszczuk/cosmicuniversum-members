// Worksheet PDFs (ebook v2 pages 16, 17, 18) from a chart. Runs in the browser; the
// templates, field map and font are the site's own files (no network call carries
// birth data: the PDF is built here and handed to the reader as a Blob).
//
// fillEditable: the editable template with its form fields filled (fields stay editable;
//   the reader's writing fields stay empty).
// renderPrint: the print template (no fields) with the same values drawn as text at the
//   field rectangles, which are read at run time from the editable template.

import {
  PDFDocument, PDFName, PDFDict, PDFBool, StandardFonts, TextAlignment, rgb,
} from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import fontkit from '../vendor/fontkit/fontkit.esm.js';
import { worksheetValues, RETRO_MARK, canShow } from './worksheet.js';

const FILES = {
  edit: '../data/ebook-pages-16-18-edit.pdf',
  print: '../data/ebook-pages-16-18-print.pdf',
  map: '../data/field-map.json',
  conv: '../data/conventions.json',
  font: '../vendor/fonts/DejaVuSans-worksheet.ttf',
};
const UNI_FONT_NAME = 'DejaVuW';
const HELV_NAME = 'Helv'; // the template's /DR name for Helvetica
const MIN_SIZE = 6;
const PAD = 2; // pdf-lib's text inset inside a field (border width 1 + 1)

const cache = new Map();
/** Default loader: the site's own file, path relative to this module. */
function fetchFile(rel) {
  if (!cache.has(rel)) {
    const p = fetch(new URL(rel, import.meta.url)).then(async (r) => {
      if (!r.ok) throw new Error(`Could not load ${rel} (HTTP ${r.status})`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => cache.delete(rel));
    cache.set(rel, p);
  }
  return cache.get(rel);
}

const json = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

async function inputs(load) {
  const [map, conv] = await Promise.all([load(FILES.map), load(FILES.conv)]);
  return { fieldMap: json(map), conv: json(conv) };
}

/** Field items whose text is the retrograde mark column. */
function retroFields(fieldMap) {
  return new Set(Object.entries(fieldMap.page16).filter(([k]) => k.endsWith('.retro')).map(([, f]) => f));
}

/** Decode PDF string escapes (\ddd octal, \n ...) that pdf-lib leaves in place. */
function unescapePdf(s) {
  const named = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
  return String(s || '').replace(/\\([0-7]{1,3}|.)/g, (m, c) => (
    /^[0-7]/.test(c) ? String.fromCharCode(parseInt(c, 8)) : (named[c] ?? c)));
}

const daOf = (fontName, size, color) => `/${fontName} ${size} Tf ${color.join(' ')} rg`;

function parseDA(raw) {
  const da = unescapePdf(raw);
  const size = /([\d.]+)\s+Tf/.exec(da || '');
  const col = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da || '');
  return {
    size: size ? +size[1] : 11,
    color: col ? [+col[1], +col[2], +col[3]] : [0.12, 0.11, 0.18],
  };
}

const charsOk = (font, text) => {
  const set = font.__chars || (font.__chars = new Set(font.getCharacterSet()));
  for (const ch of text) if (!set.has(ch.codePointAt(0))) return false;
  return true;
};

/** Largest size <= start (step 0.5, min MIN_SIZE) at which text fits the width. */
function fitSize(font, text, start, width) {
  let size = start;
  while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

/** Pick the font for a value: Helvetica when it can show it, else the DejaVu subset. */
function pickFont(text, retro, helv, uni) {
  if (retro || !charsOk(helv, text)) return charsOk(uni, text) ? uni : null;
  return helv;
}

async function prepare(chart, name, opts) {
  const load = opts.load || fetchFile;
  const { fieldMap, conv } = await inputs(load);
  const nfc = (s) => String(s || '').normalize('NFC');
  const safeName = canShow(nfc(name)) ? nfc(name) : '';
  const birth = { ...(opts.birth || {}) };
  birth.place = canShow(nfc(birth.place)) ? nfc(birth.place) : '';
  const values = worksheetValues(chart, safeName, birth, conv, fieldMap);
  return { load, fieldMap, values, retro: retroFields(fieldMap) };
}

/**
 * Editable worksheet: pages 16-18 with the form fields filled.
 * @param chart buildChart() result
 * @param {string} name reader's name ('' allowed)
 * @param {{birth?:{date?,time?,place?}, load?:(rel:string)=>Promise<Uint8Array>}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function fillEditable(chart, name, opts = {}) {
  const { load, values, retro } = await prepare(chart, name, opts);
  const [tpl, fontBytes] = await Promise.all([load(FILES.edit), load(FILES.font)]);
  const doc = await PDFDocument.load(tpl);
  doc.registerFontkit(fontkit);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  // Not subset: a PDF app that redraws a field when the reader types needs every glyph.
  const uni = await doc.embedFont(fontBytes, { subset: false });
  const form = doc.getForm();

  const dr = form.acroForm.dict.lookup(PDFName.of('DR'), PDFDict);
  const drFonts = dr.lookup(PDFName.of('Font'), PDFDict);
  drFonts.set(PDFName.of(UNI_FONT_NAME), uni.ref);

  for (const [field, text] of Object.entries(values)) {
    const tf = form.getTextField(field);
    const isRetro = retro.has(field);
    const { size, color } = parseDA(tf.acroField.getDefaultAppearance());
    // Write a clean DA on every mapped field: the template's DA strings use octal escapes
    // that pdf-lib does not decode. The ℞ column always uses the font that has the mark,
    // also when the reader types into it.
    let fontName = isRetro ? UNI_FONT_NAME : HELV_NAME;
    tf.acroField.setDefaultAppearance(daOf(fontName, size, color));
    if (!text) continue;
    const font = pickFont(text, isRetro, helv, uni);
    if (!font) continue;
    if (font === uni) fontName = UNI_FONT_NAME;
    const w = tf.acroField.getWidgets()[0].getRectangle().width - 2 * PAD;
    const fitted = fitSize(font, text, size, w);
    tf.acroField.setDefaultAppearance(daOf(fontName, fitted, color));
    tf.setText(text);
    tf.updateAppearances(font);
    // pdf-lib puts its own font name into the DA; point it back at the /DR font names.
    tf.acroField.setDefaultAppearance(daOf(fontName, fitted, color));
  }
  // Every filled field now has its own appearance. Without this flag PDF apps show
  // those appearances as they are instead of redrawing them (MuPDF, for one, redraws the
  // DejaVu fields badly). A field the reader types into is redrawn by the app anyway.
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.False);
  return doc.save({ updateFieldAppearances: false });
}

/** Field geometry from the editable template: name -> {page, x, y, width, height, size, color, align}. */
async function fieldGeometry(tplBytes) {
  const doc = await PDFDocument.load(tplBytes);
  const pageOf = new Map();
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let k = 0; k < annots.size(); k++) pageOf.set(annots.get(k).toString(), i);
  });
  const geo = {};
  for (const f of doc.getForm().getFields()) {
    const widget = f.acroField.getWidgets()[0];
    const ref = doc.context.getObjectRef(widget.dict);
    const { size, color } = parseDA(f.acroField.getDefaultAppearance());
    geo[f.getName()] = {
      page: ref ? pageOf.get(ref.toString()) : undefined,
      ...widget.getRectangle(),
      size, color,
      align: typeof f.getAlignment === 'function' ? f.getAlignment() : TextAlignment.Left,
    };
  }
  return geo;
}

/**
 * Print worksheet: pages 16-18 of the print template with the values drawn as text.
 * No form fields; the writing lines stay blank.
 * @returns {Promise<Uint8Array>}
 */
export async function renderPrint(chart, name, opts = {}) {
  const { load, values, retro } = await prepare(chart, name, opts);
  const [editTpl, printTpl, fontBytes] = await Promise.all([load(FILES.edit), load(FILES.print), load(FILES.font)]);
  const geo = await fieldGeometry(editTpl);
  const doc = await PDFDocument.load(printTpl);
  doc.registerFontkit(fontkit);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const uni = await doc.embedFont(fontBytes, { subset: true });
  const pages = doc.getPages();

  for (const [field, text] of Object.entries(values)) {
    if (!text) continue;
    const g = geo[field];
    if (!g || g.page === undefined) throw new Error(`No rectangle for field ${field}`);
    const font = pickFont(text, retro.has(field), helv, uni);
    if (!font) continue;
    const size = fitSize(font, text, g.size, g.width - 2 * PAD);
    const tw = font.widthOfTextAtSize(text, size);
    let x = g.x + PAD;
    if (g.align === TextAlignment.Center) x = g.x + (g.width - tw) / 2;
    else if (g.align === TextAlignment.Right) x = g.x + g.width - PAD - tw;
    // Same vertical place as pdf-lib puts a single-line field value.
    const y = g.y + (g.height - font.heightAtSize(size, { descender: false })) / 2;
    pages[g.page].drawText(text, { x, y, size, font, color: rgb(...g.color) });
  }
  return doc.save();
}

export { RETRO_MARK };
