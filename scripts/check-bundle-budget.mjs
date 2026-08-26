#!/usr/bin/env node
/**
 * Hard-fail client-JS budget gate. Run after `next build`; used in CI to stop a
 * change from silently re-bloating the bundle (see docs/perf.md).
 *
 * Metrics (raw bytes from the build output):
 *   - sharedFirstLoadKB: JS loaded on EVERY page (build-manifest rootMainFiles).
 *   - totalClientKB:     all client chunks (.next/static/chunks).
 *
 * Budgets live in perf-budgets.json. If growth is intentional (a real new
 * feature), bump the budget in that file and say why in the commit.
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const NEXT = '.next';

if (!existsSync(join(NEXT, 'build-manifest.json'))) {
  console.error('No .next/build-manifest.json — run `npm run build` first.');
  process.exit(1);
}

const budgets = JSON.parse(readFileSync('perf-budgets.json', 'utf8'));

function fileSize(rel) {
  for (const base of [NEXT, join(NEXT, 'static')]) {
    const p = join(base, rel);
    if (existsSync(p)) return statSync(p).size;
  }
  return 0;
}
function dirJsTotal(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) total += statSync(p).size;
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

const manifest = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
const sharedKB = Math.round(
  (manifest.rootMainFiles ?? []).reduce((s, f) => s + fileSize(f), 0) / 1024
);
const totalKB = Math.round(dirJsTotal(join(NEXT, 'static', 'chunks')) / 1024);

const checks = [
  ['sharedFirstLoadKB', sharedKB, budgets.sharedFirstLoadKB],
  ['totalClientKB', totalKB, budgets.totalClientKB],
];

console.log('Bundle budget check (raw KB):');
let failed = false;
for (const [name, actual, budget] of checks) {
  const ok = actual <= budget;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}: ${actual} (budget ${budget})`);
}

if (failed) {
  console.error(
    '\n✗ Bundle budget exceeded. If this growth is intentional, raise the limit in ' +
      'perf-budgets.json and explain why in the commit. See docs/perf.md.'
  );
  process.exit(1);
}
console.log('\n✓ All bundle budgets OK.');
