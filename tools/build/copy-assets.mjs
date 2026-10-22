// Copy the files the browser tools need into public/tools/data/.
// Run: node tools/build/copy-assets.mjs
//   tools/config/conventions.json        -> conventions.json            (committed)
//   tools/ebook/field-map.json           -> field-map.json              (committed)
//   private-files/v2/pages-16-18-edit.pdf  -> ebook-pages-16-18-edit.pdf  (git-ignored)
//   private-files/v2/pages-16-18-print.pdf -> ebook-pages-16-18-print.pdf (git-ignored)
// The two PDFs come from tools/ebook/build_v2.py. They are not committed; wrangler
// deploys them from disk, so run this script before a deploy.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'public', 'tools', 'data');
mkdirSync(out, { recursive: true });

const files = [
  ['tools/config/conventions.json', 'conventions.json', true],
  ['tools/ebook/field-map.json', 'field-map.json', true],
  ['private-files/v2/pages-16-18-edit.pdf', 'ebook-pages-16-18-edit.pdf', false],
  ['private-files/v2/pages-16-18-print.pdf', 'ebook-pages-16-18-print.pdf', false],
];

let missing = 0;
for (const [src, dst, required] of files) {
  const from = path.join(root, src);
  if (!existsSync(from)) {
    console.error(`${required ? 'ERROR' : 'WARNING'}: ${src} not found${required ? '' : ' (build it with tools/ebook/build_v2.py)'}`);
    if (required) process.exitCode = 1;
    missing++;
    continue;
  }
  copyFileSync(from, path.join(out, dst));
  console.log(`${src} -> public/tools/data/${dst}`);
}
if (missing) console.error(`${missing} file(s) not copied.`);
