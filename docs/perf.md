# Performance notes & guardrails

The app's load/navigation cost is dominated by **client JavaScript weight** (the
server is fast: API TTFB was 3–13 ms in measurement). This doc records the
optimizations, the guardrails that keep them from eroding, and how to re-measure.

## What was done

- **Code-splitting** (`next/dynamic`, `ssr:false`): the Tiptap editor
  (`components/pages/page-body-editor-lazy.tsx`) and recharts charts load on
  demand behind a skeleton instead of blocking initial paint/hydration.
- **`optimizePackageImports`** (`next.config.ts`) for `lucide-react`,
  `date-fns`, `recharts` — trims per-route chunk counts.
- **KaTeX CSS** moved out of the global layout into the math node view, so it
  loads only with the (lazy) editor.
- **Dropped unused deps** (yjs / `@tiptap` collaboration stack).
- **Cached `/api/context`** via TanStack Query so navigation reuses it instead
  of re-fetching on every mount (Budget navigation went from ~seconds to ~32 ms).

## Guardrails (enforced)

1. **ESLint `no-restricted-imports`** (`eslint.config.mjs`, runs in Husky
   pre-commit + CI):
   - The unused yjs/collaboration packages can't be imported anywhere.
   - The raw `page-body-editor` can only be imported by `page-body-editor-lazy`
     (everything else must use the lazy wrapper).
   - Route files (`app/**/page.tsx`, `app/**/layout.tsx`) can't import `recharts`
     directly — extract a client chart component and `next/dynamic` it.
2. **Hard-fail bundle budget** (`scripts/check-bundle-budget.mjs` +
   `perf-budgets.json`), run in the CI **Build** job after `next build`. Fails
   the build if shared or total client JS exceeds the committed budget. If a real
   feature legitimately grows the bundle, raise the limit in `perf-budgets.json`
   and explain why in the commit.

## How to re-measure

- **Bundle sizes:** `npm run build` then `node scripts/check-bundle-budget.mjs`
  (prints shared-first-load KB and total client KB vs budget).
- **Runtime (load + navigation):** run the prod build (`npm run build &&
npm run start -p 3002`, `SKIP_AUTH` on) and drive it with Playwright: cold-load
  each route with cache disabled and record FCP + time-to-content, and count
  `/api/…` calls per soft navigation (context should fire once per session, not
  per page). This is how the baseline below was taken.

## Baseline (2026-08, post-optimization, raw KB)

- Shared (every-page) JS: ~401 KB · Total client JS: ~8.2 MB
- `/api/context`: 1 request per soft-navigation session (was once per mount)
- Budget Overview navigation: ~32 ms

## Known follow-ups (not done)

- Portfolio/Pension still statically import their primary chart — could be
  wrapped like the others.
- Three dead chart components (`components/budget/analysis/{tag-spending-chart,
category-pie-charts,overall-trend-chart}.tsx`) are never imported — deletable.
- `/budget` server redirect causes a full reload only on a **direct** hard-load
  (normal nav links straight to `/budget/dashboard`).
- Server-side query tuning was out of scope (not today's bottleneck, but the
  measurement DB was near-empty — revisit with production-scale data).
