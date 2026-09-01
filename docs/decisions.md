# Decisions — the "why" the code can't hold

Code is the source of truth for _what/how_ the app works (read `prisma/schema.prisma`,
`app/`, `lib/`; design tokens in `docs/design-system.md`). This file holds only the
**non-derivable rationale** — business rules, rejected alternatives, thresholds and
cadences chosen for a reason, and deliberate scope exclusions — that reading the code
alone would not reveal. Add to it (or to auto-memory) whenever a task involves such a
decision; the `Stop` hook gates on this.

_Seeded 2026-09-01 by salvaging `docs/the_hub_ai_spec.md` before deleting it._

## Net Worth / Dashboard / Snapshots

- **Breakdown reconciles exactly to the total.** Categories are designed so
  `Σ parts − debts === netWorth` (unit-tested); cash/savings (bank & deposit balances)
  deliberately fold into the Portfolio bucket rather than showing as their own line.
- **Snapshots are bi-weekly (1st & 15th), not daily** — a deliberate cadence choice to
  limit database growth.
- **Moneytor bank/debt balances are display-only and excluded from Net Worth**, to avoid
  double-counting any overlapping manual `misc_assets`.

## Pension

- **Anomaly threshold: >20% vs. the average of the last 3 deposits.** The 20% sensitivity
  and the trailing-3 baseline are both deliberate choices.
- **Quarterly missing-deposit check keys off Jan/Apr/Jul/Oct 1**, checking whether deposits
  were made for the _previous_ quarter.
- **Salary month is tracked separately from deposit date** — which month's salary a deposit
  represents is distinct from when the money arrived.

## Monthly Budget

- **Budget month is payment-method-aware.** Credit-card transactions follow the household
  billing cycle (e.g. day 10 → `Jun 10–Jul 10`) to match card statements; everything else
  follows the calendar month.
- **Analysis tab defaults to the current month, not all-time.** A whole-month selection
  buckets a card charge into its cycle month even if dated in the next calendar month.
- **Savings routes and analysis trends intentionally keep their own month definitions**
  (billing cycle vs. pure calendar); these can diverge from the summary only at
  cycle-boundary edge cases — a known, accepted tradeoff.

## AI Categorization

- **AI guesses are stored as suggestions, never auto-applied** — one-tap approval by design;
  the model never sets a category on its own.
- **Confidence cutoff is 0.6** for attaching a suggestion (below = logged only).
- **Each row is attempted exactly once** (`categorizationAttemptedAt`) instead of re-querying
  every run; after a few errors a row is marked attempted so a persistent failure (e.g. a bad
  API key) can't re-bill it.
- **Scheduling is shaped by the Vercel Hobby plan** (crons capped at once/day, 2 total): the
  post-response `after()` / read-triggered / folded-into-daily-cron design deliberately avoids
  needing a frequent cron.
- **Approving a guess sets the payee default** (except `neverDefault`/blacklisted payees);
  dismissing leaves the row uncategorized.

## Backup / Restore

- **Backup and restore are kept in lockstep** (every captured table is restored). Project
  concepts insert before Sources to satisfy the self-referential `project_id` FK.
- **Some tables are intentionally excluded as regenerable telemetry / superseded data:** raw
  `moneytor_transactions`, old stock-portfolio tables, `verification_tokens`, `cron_run_logs`,
  `budget_categorization_logs`.

## Pages / Areas

- **Paragraphs get direction from CSS `unicode-bidi: plaintext`, not a `dir` attribute** — a
  `dir` on an inner `<p>` makes the parent `<li dir="auto">` skip that text per the HTML spec,
  mis-placing the bullet.
- **`outdentListItem` is a custom reimplementation** — ProseMirror's `liftListItem` silently
  re-parents following siblings; the keymap consumes Tab in lists even when indent is
  structurally impossible; `list-commands.ts` resolves the node name from the live schema
  because the old `listItem || taskItem` fallback threw (StarterKit ships no `taskItem`).
- **A row-detail body can't nest another database block** (deliberate). Body is stored as
  Tiptap JSON on the row and merged against latest rows so body edits never clobber a
  concurrent field edit.
- **DB-block filter/sort state is ephemeral per-viewer, never persisted** to the document.
- **Mobile block reordering is scoped to top-level blocks only** — the desktop HTML5 drag
  doesn't work on touch.
- **Tab switching flushes pending autosave and remounts each body** to preserve the "read once"
  editor invariant.
- **Agent token scope is read+write only; the two DELETE routes stay session-only** — a headless
  agent can edit but never destructively delete.

## Tasks

- **The Type enum (Calls / Deep work / Out & about / Blocked / Decide / Quick) exists to batch
  similar work**, distinct from free-text Status and from Priority.
- **Carousel empty groups sort stably to the end** so swiping hits columns with work first.
- **Carousel has no multi-select** because long-press is spent on opening full-screen.

## Moneytor Integration

- **Moneytor data lives in a separate read-only dataset, isolated from `budget_transactions`**,
  so the rich budget tooling isn't contaminated with raw external data.
- **Stocks use full-refresh (delete-then-upsert) per account** — the `/assets` endpoint returns
  a snapshot, not deltas, so this handles removed positions correctly.
- **Debts are stored as negative balances** so downstream charts get the right sign without
  per-row logic.
- **Snapshot history is forward-only** — Moneytor doesn't expose price history; multiple
  same-day syncs overwrite today's row.
- **Budget promotion is insert-only to preserve user edits forever**; amount/date corrections
  deliberately don't propagate; CSV-conflict rows are stamped rather than duplicated. No
  Moneytor-specific category mapping — deliberately reuses the existing `PayeeCategoryRule`
  system.
- **`/portfolio/v2` shows "Not enough history yet" until ≥2 sync days exist and never
  synthesizes chart data** (sparklines hidden). Note `AccountSparkline` _does_ fall back to
  synthetic data when given no `points`, to preserve v1 behavior.
- **Combined totals sum each API's pre-aggregated ILS sums, not per-account sums** — per-account
  totals are in native currency.

## Portfolio (legacy)

- **Stock prices are cached/refreshed every 6 hours specifically to avoid API rate limits.**
  Historical prices are stored for net-worth-graph accuracy.

## Notifications

- **"Inconsistent Owner State" and "General Info" are deliberately future/unimplemented**
  (owner-state is logged server-side only, no UI) — a scope marker, not missing code.

## Auth

- **The email allowlist is intentional, not a limitation:** this is a 2-person household app,
  so the access-control model is deliberately tiny.

## PWA / Service Worker

- **The service worker deliberately never caches `/api/*` or auth routes** — a conservative
  policy appropriate for a financial app.

## Moneytor sync — pending→settled twin merge

- **Historical Moneytor imports produced duplicate rows** for a single real-world
  charge: once as the pending "רגילה" version (older date, `moneytorId=NULL`
  after Moneytor's side removed it) and again as the settled version (newer
  date, a new `moneytorId`). Moneytor now reuses the pending's date on the
  settled row, so future syncs won't dupe, but the historical pairs still
  needed collapsing.
- **Merge policy is intentionally conservative** to avoid collapsing
  legitimate recurring same-amount buys (bus fare, corner shop). It requires
  same (`payee_id`, `amount`, `source='moneytor_sync'`), ±7 days apart, AND
  the older row's `moneytor_id` is NULL. Two rows that each carry their own
  `moneytor_id` are separately-issued and are never merged.
- **Survivor = the earlier row** (pending's date is what the user knows;
  it usually holds their manual category). The later row's `moneytorId`
  is moved to the survivor, either side's category wins (survivor first),
  and the later row is soft-deleted with `mergedFromId` recording the link
  for debugging in the edit UI.
- **Twin's `moneytor_id` is cleared before the survivor claims it** because
  `moneytor_id` has a UNIQUE constraint — see `lib/utils/dedupe-moneytor-twins.ts`.
