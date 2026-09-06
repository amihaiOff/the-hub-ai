# Decisions — the "why" the code can't hold

Code is the source of truth for _what/how_ the app works (read `prisma/schema.prisma`,
`app/`, `lib/`; design tokens in `docs/design-system.md`). This file holds only the
**non-derivable rationale** — business rules, rejected alternatives, thresholds and
cadences chosen for a reason, and deliberate scope exclusions — that reading the code
alone would not reveal. Add to it when a decision is worth keeping — this is a
reference, not an enforced step.

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

## `feature-brief` skill — build-vs-adopt, and no spec artifact

- **Built a repo-specific skill rather than adopting a generic one.** The
  installed `mattpocock-skills:grilling` runs an excellent round-based
  interview but is deliberately domain-agnostic: nothing in it forces
  coverage of _dimensions_, so it only probes where the conversation
  happens to lead. Off-the-shelf spec skills (`feature-forge`,
  "Requirements Elicitation") do carry dimension checklists, but they're
  enterprise-shaped — EARS syntax and formal spec documents — and they
  conflict with code-as-spec (see `workflow-code-as-spec` memory).
  `feature-brief` therefore owns only the part that _must_ be
  repo-specific (the coverage matrix) and **delegates the interview
  itself to `grilling`** rather than reimplementing it.
- **Questions are classify-then-load, not one flat checklist.** The first
  version asked every feature all ~15 dimensions; that meant asking a
  chart tweak about `Decimal` precision and cron cadence, which trains
  the user to skim — the exact failure the skill exists to prevent. So
  the skill now classifies the feature along 8 axes (route? UI? data?
  money? Areas? unattended? external service? household-shared?) and
  loads **only the triggered packs**, on top of a 4-row always-on core.
  Loading an untriggered pack is explicitly banned, same as skipping a
  row in a loaded one.
- **The packs are hard-coded; the per-feature fit comes from
  classification, not from re-deriving surfaces each run.** Surveying
  the codebase per invocation never drifts but is slow and yields an
  inconsistent interview each time. The maintenance cost of hard-coding
  is mitigated two ways: every row names the file it came from, so
  staleness is auditable; and a final harvest step reads the nearest
  analogous feature and adds any cross-cutting concern the packs
  missed — which is what keeps the skill honest for corners of the app
  the packs never anticipated.
- **The skill emits no spec file — output goes straight into plan mode.**
  A persisted brief would be exactly the drifting prose spec this repo
  retired. The brief's value is entirely in _forcing the questions to be
  asked_; once answered, the answers belong in the code (what/how) and
  in this file or memory (why). A third copy would be the one nobody
  updates.
  **When to break this:** if a feature is large enough to need async
  review across multiple sessions, write the brief to a gitignored
  scratch file under `.claude/` — never to a tracked `docs/` path,
  and delete it once implementation starts.
- **"Not applicable, because X" is a required output, not a skipped row.**
  Silence on a matrix row is indistinguishable from an oversight, which
  is the exact failure mode the skill exists to prevent.

## Product truth lives in `PRODUCT.md`

- **`PRODUCT.md` (project root) is the authority for product truth** — users,
  purpose, positioning, operating context, brand commitments, evidence, and
  product principles. Written via `/impeccable init`. It is deliberately _not_
  duplicated here; this section records only the judgment calls made while
  writing it, which the file itself doesn't explain.
- **The user model is asymmetric, and that is a design constraint.** One
  operator (sets up, reviews, categorizes, administers) and one partner (mostly
  captures shopping/tasks and reads). **Consequence:** capture and read paths
  must be usable by someone who did not build the app and does not carry its
  model in their head; only administrative surfaces (settings, Labs,
  categorization, household structure) may assume expertise. Rejected the
  "equal peers" model, which would have forced every surface to the lower
  expertise bar.
- **Review outranks entry.** Because transactions arrive mostly via Moneytor
  sync rather than manual entry, correcting/confirming/scanning are the primary
  interactions. Optimize those over creation forms — a non-obvious inversion of
  the usual finance-app assumption.
- **Israeli-finance specifics are positioning and capability, not a
  must-preserve constraint.** Hishtalmut, TASE `.TA`, BOI prime, ILS-native,
  Moneytor are recorded as what the product _is_ and does. When asked which
  constraints future design work must preserve, the user selected only
  **financial precision** (`Decimal`, never float) and **mobile PWA + offline**,
  and deliberately did not select the Israeli domain rules or the two-person
  trust model. Respect that boundary rather than promoting them back.
- **Accessibility is deliberately undecided, not defaulted.** No external
  conformance target (e.g. WCAG AA) has been committed. What exists is recorded
  factually — extensive `aria-label` coverage, a keyboard skip-to-content link
  in `app-shell.tsx`. Do not assert a standard the household never chose.
- **No public surface exists to draw evidence from.** No customers,
  testimonials, case studies, press, pricing, or benchmarks. Future design work
  must not fabricate any of these to fill a layout.

## Favourites drawer (mobile)

- **Route favourites store a bare pathname — never query params.** A favourite
  pinned to `/budget/transactions?month=2026-08` would rot into a link to a
  stale month, because budget month is billing-cycle-aware and Analysis
  deliberately defaults to the current month (see **Monthly Budget** above).
  Pinned filters would be a separate saved-view feature, not a favourite.
- **Only nav-registered routes are favouritable.** `defaultTitleForPath` always
  succeeds (it prettifies the last path segment), so it can never report that a
  route is dead. Validating against the nav allowlist at write time is
  therefore the only way the drawer's greyed-out "removed" state can mean
  anything: everything stored is known-good by construction, so greying only
  appears after a code change drops a nav entry. Consequence: the star is
  disabled on dynamic content routes like `/wiki/<id>`.
- **A dead route favourite is never auto-deleted** — it renders greyed with a
  remove button. Silently dropping something the user deliberately pinned is
  worse than a visible dead entry they can clear.
- **Panes were deliberately excluded from v1.** Favouriting a pane needs
  `?tab=<id>` deep-linking on `/areas/[id]`, which collides with three things:
  `desktop-tabs-bar.tsx` syncs on `usePathname()` (which excludes the query
  string); `writeStoredActivePane` fires on mount-time resolution, so merely
  _following_ a pane link would overwrite the user's remembered pane; and it
  would be the app's first URL-synced state, with no `scroll: false` precedent
  anywhere. Accepted consequence: `/areas/<id>` always opens the first pane, so
  starring while on pane 3 and returning lands on pane 1.
- **No `kind` discriminator column.** The target is fully determined by which
  of `pageId` / `route` is non-null, and storing `kind` without a CHECK
  constraint (this schema has none) would create a second source of truth that
  can disagree. If panes ever return they would _also_ carry a `pageId`, which
  breaks `@@unique([ownerId, householdId, pageId])` — that is the moment to add
  `kind` and re-scope the uniques.
- **Dedupe uses two plain unique triples, not a partial index.** Postgres treats
  NULLs as distinct, so page rows (`route` NULL) never collide on the route
  index and vice versa. The repo has zero partial-index precedent, and one would
  mean hand-appending raw SQL to a generated migration. Both triples include
  `householdId` because a route string — unlike a page FK — carries no household
  of its own. Consequence: these indexes are a race backstop only, not a lookup
  key, since a compound unique whose nullable member is null can't be matched by
  `findUnique`/`upsert`; all reads use `findFirst` and `P2002` maps to 409.
- **Favourites use `getCurrentContext()`, not `resolvePagesAccess()`**, and their
  ownership guards include `ownerId` rather than only `householdId`. Favourites
  are per-user, so the usual household-only guard would let one housemate delete
  the other's — and `resolvePagesAccess` deliberately collapses agent-token auth
  onto the household owner, which must never write a real person's drawer.
