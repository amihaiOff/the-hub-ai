#!/usr/bin/env node
/**
 * Hard-fail client-JS budget gate. Run after `next build`; used in CI to stop a
 * change from silently re-bloating the bundle (see docs/perf.md).
 *
 * Metrics (raw bytes from the build output):
 *   - sharedFirstLoadKB: JS loaded on EVERY page (build-manifest rootMainFiles).
 *   - routeFirstLoadKB:  JS a page downloads when it opens (shared + that
 *                        route's entry chunks) — the heaviest route is checked.
 *                        This is the one that tracks what users actually wait for.
 *   - totalClientKB:     all client chunks (.next/static/chunks), lazy ones
 *                        included. A loose cap on overall growth only: splitting
 *                        code into on-demand chunks can RAISE it while making
 *                        pages faster.
 *
 * Budgets live in perf-budgets.json. If growth is intentional (a real new
 * feature), bump the budget in that file and say why in the commit.
 */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';

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

// Per-route first load, from each page's client-reference manifest (a JS file
// that assigns globalThis.__RSC_MANIFEST[route] = { entryJSFiles, ... }).
const routes = [];
const findManifests = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) findManifests(p);
    else if (e.name === 'page_client-reference-manifest.js') routes.push(p);
  }
};
findManifests(join(NEXT, 'server', 'app'));
if (routes.length === 0) {
  console.error('No page client-reference manifests found under .next/server/app.');
  process.exit(1);
}
let heaviest = { route: '', kb: 0 };
for (const file of routes) {
  const ctx = {};
  vm.runInNewContext(readFileSync(file, 'utf8'), ctx);
  const m = Object.values(ctx.__RSC_MANIFEST ?? {})[0];
  if (!m?.entryJSFiles || Object.keys(m.entryJSFiles).length === 0) {
    // Manifest format changed (Next upgrade?) — fail loudly rather than report 0.
    console.error(`Unrecognised client-reference manifest: ${file}`);
    process.exit(1);
  }
  const files = new Set([
    ...(manifest.rootMainFiles ?? []),
    ...Object.values(m.entryJSFiles).flat(),
  ]);
  // Includes favicon/not-found entries too — slight overcount, on the safe side.
  let bytes = 0;
  for (const f of files) {
    const size = fileSize(f);
    if (!size) {
      // A path-format change would otherwise count as 0 and pass silently.
      console.error(`Chunk not found: ${f} (from ${file})`);
      process.exit(1);
    }
    bytes += size;
  }
  const kb = Math.round(bytes / 1024);
  if (kb > heaviest.kb) heaviest = { route: relative(join(NEXT, 'server', 'app'), file), kb };
}
const checks = [
  ['sharedFirstLoadKB', sharedKB, budgets.sharedFirstLoadKB],
  [
    `routeFirstLoadKB (heaviest: /${heaviest.route.replace(/\/page_client-reference-manifest\.js$/, '')})`,
    heaviest.kb,
    budgets.routeFirstLoadKB,
  ],
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
