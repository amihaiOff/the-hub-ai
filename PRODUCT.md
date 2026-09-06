# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people in one household, in **asymmetric roles**:

- **The operator** (primary user, the app's owner). Sets up accounts, reviews
  and categorizes transactions, watches net worth, and maintains the household's
  structure. Uses every surface, on both phone and desktop.
- **The partner** (secondary user). Mostly **captures** — shopping items, tasks —
  and **reads** shared state. Not expected to configure, categorize, or
  administer anything.

Design consequence: capture and read surfaces must work for someone who did not
build the app and does not carry its model in their head. Operator-only surfaces
(settings, Labs, categorization, household structure) may assume expertise.

## Product Purpose

A single private hub for running a household: money (budget, transactions,
investments, pension, assets and debt, insurance), and the daily life around it
(tasks, shopping, notes, documents). It exists so the household's financial and
operational state lives in one place the household fully controls, and so the
routine bookkeeping largely maintains itself.

Success is that the operator trusts the numbers without re-deriving them, and
that the partner can capture or check something without asking the operator.

## Positioning

Four differentiators, all confirmed as load-bearing:

1. **Israeli household finance, natively.** Hishtalmut/pension deposit tracking,
   TASE symbols (`.TA`), Bank of Israel prime for loans and mortgages, Moneytor
   transaction sync, ILS-native display with conversion for foreign holdings.
   Foreign products model none of this correctly.
2. **One hub, cross-linked.** Money, tasks, shopping, notes and documents coexist
   and can reference each other. The value is the adjacency, not any single
   module beating its specialist.
3. **Automation removes the data entry.** Moneytor sync, AI categorization, and
   scheduled snapshots mean the ledger maintains itself rather than being kept.
4. **It bends to this household.** No SaaS constraints or subscription; every
   rule is exactly this household's rule. The differentiator is fit.

## Operating Context

- **Installed PWA on Android** for the in-the-moment cases: capture a shopping
  item, add a task, glance at a number.
- **Desktop browser** for review and administration: analysis, categorization,
  settings, Labs.
- Mixed-scene usage is normal — the same surface is often reached from a phone in
  a shop and a laptop at a desk.
- Transactions arrive mostly by sync rather than manual entry, so review and
  correction are more common interactions than creation.

## Capabilities and Constraints

Surfaces: dashboard, budget (transactions, categories, payees, tags, savings,
analysis, dashboard), portfolio, pension, assets (incl. mortgage simulator),
insurance, tasks, shopping, wiki, Areas (Notion-like pages with tabs and database
blocks), Moneytor transactions, settings, onboarding, and Labs (activity, AI
usage, categorization log, sync log, dropped transactions).

Confirmed constraints:

- **Financial precision is a correctness property, not polish.** Monetary values
  are `Decimal` in the database and never float; the UI uses tabular figures.
  Rounding or float drift is a bug.
- **Must remain an installable Android PWA that works offline.** The service
  worker deliberately never caches `/api/*` or auth routes — a conservative
  policy appropriate to a financial app.
- Household-scoped data with owner attribution throughout; access is limited by
  an email allowlist.
- Net worth = stocks + pension + assets − debt, snapshotted on a schedule rather
  than daily.

Terminology: _Hishtalmut_ (Israeli study/severance fund), _Areas_ (pages),
_Moneytor_ (the transaction source), _Labs_ (operator diagnostics).

## Brand Commitments

- Name and wordmark: **The Hub** (`short_name` "The Hub").
- **Lexend** for all body, UI, and headings. **Playfair Display** exclusively for
  the "The Hub" wordmark and nowhere else.
- Dark mode is the primary theme; light mode is secondary. Warm-slate palette
  with a pastel-blue accent, green for gains, red for losses.
- Icons at `public/icons/` incl. maskable variants; theme color `#2a2f3a`.
- `docs/design-system.md` is the standing token authority — semantic tokens
  (`bg-card`, `text-muted-foreground`, …), never hard-coded hex.

## Evidence on Hand

- Real household financial data in the production Neon branch (read-only to
  agents by policy). Preview and local databases carry seeded data.
- `docs/design-system.md` — tokens, palette, radii, shadows, typography.
- `docs/decisions.md` — the "why" record for rules the code cannot express.
- 67 components carry `aria-label`s; `app-shell.tsx` ships a skip-to-content link.
- **Absent, and must not be fabricated:** there are no customers, testimonials,
  case studies, press, pricing, benchmarks, or public marketing surface. This is
  a two-person private app.

## Product Principles

1. **Trust the number or the app is worthless.** Precision and traceability beat
   expressiveness everywhere money appears.
2. **The partner is not the operator.** Capture and read paths must be usable
   without the operator's mental model; expertise may only be assumed on
   administrative surfaces.
3. **Review over entry.** Data mostly arrives by sync, so correcting, confirming
   and scanning are the primary interactions — optimize those, not creation forms.
4. **Phone and desktop are both first-class, for different jobs.** In-the-moment
   capture on mobile; deliberate review on desktop. Neither is a degraded port.
5. **Adjacency is the point.** Prefer connecting existing surfaces over adding a
   parallel one.

## Accessibility & Inclusion

No external standard has been established as a requirement. Implemented today:
extensive `aria-label` coverage and a keyboard skip-to-content link. Dark-mode-
primary contrast and touch-target sizing on mobile are the live practical
concerns. Treat this as undecided rather than as a committed conformance target.
