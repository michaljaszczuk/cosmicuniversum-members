// tools/report/facts.mjs: clock-change choice (fold) and the time check (demo data only).
// Run: node --test tools/tests/report-facts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const demo = JSON.parse(readFileSync(path.join(root, 'tools/report/samples/demo-input.json'), 'utf8'));

function runFacts(input) {
  const dir = mkdtempSync(path.join(tmpdir(), 'facts-test-'));
  try {
    const inF = path.join(dir, 'in.json'), outF = path.join(dir, 'out.json');
    writeFileSync(inF, JSON.stringify(input));
    const r = spawnSync(process.execPath, [path.join(root, 'tools/report/facts.mjs'), inF, outF], { encoding: 'utf8' });
    return { code: r.status, stderr: r.stderr, facts: r.status === 0 ? JSON.parse(readFileSync(outF, 'utf8')) : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('timeCheck matches the Rising sign and says if the time fits', () => {
  const { code, facts } = runFacts({ ...demo, sure: 15 });
  assert.equal(code, 0);
  assert.equal(facts.timeCheck.rising, facts.items['bigThree.rising']);
  assert.equal(facts.timeCheck.sure, 15);
  assert.equal(typeof facts.timeCheck.fits, 'boolean');
  assert.match(facts.timeCheck.from, /^\d\d:\d\d/);
  assert.match(facts.timeCheck.to, /^\d\d:\d\d/);
});

test('sure defaults to 0', () => {
  assert.equal(runFacts(demo).facts.timeCheck.sure, 0);
});

const clockChange = { ...demo, date: '2021-10-31', time: '02:30' }; // Poland: 02:30 happened twice

test('ambiguous time with fold 1 takes the later instant', () => {
  const { code, facts } = runFacts({ ...clockChange, fold: 1 });
  assert.equal(code, 0);
  assert.equal(facts.input.utc, '2021-10-31T01:30:00.000Z');
});

test('ambiguous time with fold 0 takes the earlier instant', () => {
  assert.equal(runFacts({ ...clockChange, fold: 0 }).facts.input.utc, '2021-10-31T00:30:00.000Z');
});

test('ambiguous time without fold stops', () => {
  const r = runFacts(clockChange);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /ambiguous/);
});
