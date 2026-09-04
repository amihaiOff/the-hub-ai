---
name: feature-brief
description: Turn a rough feature idea into a complete, edge-case-covered brief before any code is written. Use when the user describes a new feature, says "I want to add X", or asks to spec/scope/think through a feature.
---

# Feature Brief

The user's first description of a feature is always incomplete — not because
they're careless, but because the app has surfaces they aren't looking at when
they picture the idea. A "sidebar of favorite pages" is really: a desktop
surface, a mobile surface, an add path, a remove path, a reorder question, an
empty state, and a "do panes count?" question.

Your job: **close every gap before planning**, answering from the code whatever
you can and asking the user only what's genuinely their decision.

The questions must fit the feature. Ask a chart tweak about `Decimal`
precision and cron cadence and you've trained the user to skim. So: a small
always-on core, plus only the packs the feature actually triggers, plus
whatever the neighbouring code turns out to care about.

## Step 1 — Ground and classify

In parallel, before asking anything:

- Read `docs/design-system.md` if the feature touches UI at all.
- **Find the nearest existing analogue and read it.** `lib/hooks/use-*.ts` maps
  the feature areas (budget, portfolio, pension, assets, insurance, shopping,
  tasks, wiki, pages, moneytor, dashboard, profiles, households). Whichever
  the feature lands in or beside, that code is your best answer to "how should
  this work" — usually "the same way its neighbour already does."

Then classify, answering each from the request and the code — not from the user:

1. Does it add or change a **route**?
2. Does it render **UI**?
3. Does it **read or write persisted data**?
4. Does it involve **money**?
5. Does it live in **Areas / user-generated pages**?
6. Does it run **unattended** (scheduled or triggered)?
7. Does it depend on an **external service**?
8. Does it change something **shared across the household**?

State the classification in one line so the user can correct it before you
spend a round of questions on the wrong packs.

## Step 2 — Always-on core

These apply to essentially every feature. Four rows, no exceptions:

| Dimension | Notes |
|---|---|
| **Scope boundary** | What is explicitly *not* in this feature. Name it — a stated exclusion is a decision; an unstated one is a future argument. |
| **Full lifecycle** | Not just the happy "add" path: read, edit, remove, and — for anything ordered or listed — reorder. A feature described as "add X" almost never mentions removal. |
| **Empty / loading / error** | All three, named. Empty-state copy, `Skeleton` while loading, what the user sees when it fails. |
| **Done means what** | The one observable thing that proves it works, for the `testing-agent` to verify later. |

## Step 3 — Conditional packs

Load a pack **only** if Step 1 triggered it. For each row in a loaded pack,
resolve to *answered from code* / *ask the user* / *not applicable because X*.

**Route** (trigger 1)
- Nav entry registers **once** in `lib/constants/navigation.ts` (`navItems`) —
  both `sidebar.tsx` and `mobile-menu.tsx` consume it, but render differently.
- Should it be openable in the desktop tabs bar? `desktop-tabs-bar.tsx` is not
  a nav list: user-opened tabs in localStorage via `use-desktop-tabs`, with
  drag-reorder and a title from `lib/utils/page-titles.ts`.

**UI** (trigger 2)
- Desktop and mobile described separately — `app-shell.tsx` composes `Sidebar`
  vs `MobileHeader` + `MobileMenu` as distinct trees.
- Input pattern: repo convention is a bottom sheet on mobile (`*-sheet.tsx`),
  dialog on desktop.
- Dark mode is the primary theme. Semantic tokens only, never hex.
- Does it need a preference in `app/settings/*`?

**Data** (trigger 3)
- New Prisma model, new column, or reuse an existing one?
- Server vs client state, per CLAUDE.md: server → TanStack Query with a key
  factory; UI-only → Zustand/`useState`. Never copy server data into local state.
- Optimistic updates? See `onMutate` in `use-tasks.ts`, `use-shopping.ts`.
- Migration/backfill for existing rows.
- Limits and collisions: max count, duplicates, and what happens when a
  referenced entity is deleted or renamed.

**Money** (trigger 4)
- Monetary values are `Decimal` in the DB — never float. See
  `lib/api/transformers/budget.ts`, `lib/utils/portfolio.ts`.
- Does it feed net worth? `lib/utils/net-worth-breakdown.ts`,
  `use-dashboard.ts`, and the `create-snapshot` cron.
- Currency and conversion — is it ILS-native, or does it need
  `lib/api/exchange-rates.ts`?

**Areas / pages** (trigger 5)
- Panes, tabs, and database blocks: `components/pages/*` (`page-editor`,
  `page-tab-bar`, `database-block`), `components/shared/areas-nav.tsx`.
  Ask explicitly whether these are in scope — the most commonly forgotten
  surface.
- Does it interact with the `for Claude` backlog column? (`lib/agent/backlog.ts`)

**Unattended** (trigger 6)
- Cadence, and *why that cadence* — cost, rate limits, or data freshness.
  Existing jobs: `app/api/cron/{create-snapshot,daily-tasks,suggest-categories}`.
- Idempotency: what happens on a double-run or a retry.
- Does it need to notify anyone, or fail silently?

**External service** (trigger 7)
- Caching TTL and the reason for it. See `lib/api/rate-limit.ts`,
  `fetch-utils.ts`, `errors.ts`.
- Failure behaviour: stale data, empty, or a visible error?

**Household-shared** (trigger 8)
- `householdId` scoping (~170 API files) and `ownerId` attribution.
- Shared or per-profile? What the other household member sees, and whether
  they can undo it.

## Step 4 — Harvest what the packs missed

The packs encode the concerns that recur *app-wide*. The analogue you read in
Step 1 will have concerns specific to its corner of the app. Name any
cross-cutting thing it handles that no loaded pack asked about, and add it to
the frontier. This is what keeps the skill honest for feature areas the packs
never anticipated.

## Step 5 — Grill the frontier

Hand the open questions to the `mattpocock-skills:grilling` skill and follow its
protocol: batch the whole answerable frontier into one round, number each
question, and **give your recommended answer for every one** so the user can
reply "yes to all" or correct only what they disagree with.

Restate the code-answered rows compactly first, so a wrong assumption gets
caught early:

```
Classified: route + UI + data + household-shared. Not money, not Areas,
not unattended, no external service.
Resolved from code: mobile sheet + desktop dialog (matches tag-picker-sheet),
household-scoped, TanStack Query with a new key factory.
```

Iterate rounds until the frontier is empty.

## Step 6 — Hand off to plan mode

Once nothing is silently assumed, call `EnterPlanMode` and turn the brief into
an implementation plan. **Do not write a spec file** — per CLAUDE.md the code is
the spec, and the brief's value was in forcing the questions, not in being
kept. Decisions the code can't express get captured at session end per CLAUDE.md.

## Rules

- **Never invent an answer to a product question.** Recommend, then wait.
- **Never ask for a fact you could look up.** Grep it, or dispatch a subagent.
- **Never leave a row in a *loaded* pack unmentioned.** "Not applicable,
  because X" is a valid outcome; silence isn't.
- **Never load a pack the feature didn't trigger.** Irrelevant questions are
  how a checklist trains the user to ignore it.
- Keep the packs current. If you add a genuinely new app-wide concern, add the
  row; if a pack row stops earning its place, delete it.
