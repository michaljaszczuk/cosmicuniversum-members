// Copy the files the browser tools need into public/tools/data/.
// Run: node tools/build/copy-assets.mjs
//   tools/config/conventions.json        -> conventions.json            (committed)
//   tools/ebook/field-map.json           -> field-map.json              (committed)
//   private-files/v2/pages-16-18-edit.pdf  -> ebook-pages-16-18-edit.pdf  (git-ignored)
//   private-files/v2/pages-16-18-print.pdf -> ebook-pages-16-18-print.pdf (git-ignored)
// The two PDFs come from tools/ebook/build_v2.py. They are not committed; wrangler
// deploys them from disk, so run this script before a deploy.
//
// Strict by default: any missing file is an error (exit code 1), so a deploy never goes
// out without the worksheet templates. For dev/test checkouts without the PDFs:
//   node tools/build/copy-assets.mjs --allow-missing   (missing PDFs are warnings only)
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// --root=<dir> copies inside another checkout (used by the tests).
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'public', 'tools', 'data');
mkdirSync(out, { recursive: true });

const files = [
  ['tools/config/conventions.json', 'conventions.json', true],
  ['tools/ebook/field-map.json', 'field-map.json', true],
  ['private-files/v2/pages-16-18-edit.pdf', 'ebook-pages-16-18-edit.pdf', false],
  ['private-files/v2/pages-16-18-print.pdf', 'ebook-pages-16-18-print.pdf', false],
];

const allowMissing = process.argv.includes('--allow-missing');
let missing = 0;
for (const [src, dst, json] of files) {
  const from = path.join(root, src);
  if (!existsSync(from)) {
    const soft = allowMissing && !json;
    const hint = json ? '' : ' Build it with: python tools/ebook/build_v2.py';
    console.error(`${soft ? 'WARNING' : 'ERROR'}: ${src} not found.${hint}`);
    if (!soft) process.exitCode = 1;
    missing++;
    continue;
  }
  copyFileSync(from, path.join(out, dst));
  console.log(`${src} -> public/tools/data/${dst}`);
}
if (missing) {
  console.error(`${missing} file(s) not copied.${process.exitCode ? ' The tools will not work without them. Use --allow-missing only for dev/test.' : ''}`);
}
