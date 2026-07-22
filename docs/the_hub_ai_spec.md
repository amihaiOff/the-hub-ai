# The Hub AI

# Features & User Flows

## Main Dashboard

**Purpose:** High-level overview of total household finances

### Components

1. **Net Worth Banner**
   - Large, prominent display of current total net worth
   - Color-coded: green if positive trend, red if negative
   - Shows change from previous snapshot (e.g., "+$5,230 this month")

2. **Net Worth Over Time Graph**
   - Line chart showing net worth history (monthly snapshots)
   - X-axis: Time (last 6 months, 1 year, all time - toggleable)
   - Y-axis: Net worth value
   - Interactive: hover to see exact values on specific dates
   - Breakdown on hover showing: stocks, pension, assets, debt

3. **Quick Stats Cards**
   - Total Stock Portfolio Value
   - Total Pension/Hishtalmut Value
   - Total Assets
   - Total Debt (if any)
   - Each card clickable to navigate to detail view

4. **Total Worth breakdown** (`components/dashboard/total-worth-card.tsx`)
   - Itemizes net worth into categories that reconcile exactly to the total:
     **Portfolio** (stocks + cash/savings), **Pension** (retirement only),
     **Hishtalmut** (study funds), **Real estate**, **Other assets** (catch-all),
     minus **Debts**.
   - Cash/savings (bank & deposit balances) fold into the Portfolio bucket
     rather than showing as their own line.
   - Pension vs Hishtalmut split: manual accounts by `PensionAccount.type`;
     Moneytor funds by `sugKupa` (3 = hishtalmut) with a Hebrew-`productType`
     fallback.
   - Rendered as a stacked share-of-assets bar plus a legend (label, % of gross
     assets, amount); Debts shown separately in red. Respects the ILS/USD
     display-currency selector.
   - Computed server-side by the pure `computeNetWorthBreakdown`
     (`lib/utils/net-worth-breakdown.ts`) and returned as `data.breakdown` from
     `GET /api/dashboard`. Reconciliation (`Σ parts − debts === netWorth`) is
     unit-tested.

### User Flow

1. User signs in with Google → lands on main dashboard
2. Dashboard auto-calculates current net worth from all sources
3. User can click any card to drill down into details
4. User can change time range for graph

# Monthly Budget

## Monthly period (billing cycle vs calendar month)

A `YYYY-MM` budget month is **payment-method-aware**:

- **Credit-card** transactions follow the household **billing cycle** — the
  `Household.billingCycleStartDay` (1/2/10). With start day 10, "June" is the
  card statement cycle `Jun 10 → Jul 10` (matches how card charges are billed).
- **Everything else** (bank transfer, cash, check, other) follows the whole
  **calendar month** (`Jun 1 → Jul 1`), regardless of the start-day setting.

When the start day is 1 the two windows coincide. The split is computed by
`monthTransactionWhere` (`lib/utils/billing-cycle.ts`) — a Prisma `where`
fragment ORing the card cycle with the calendar-month range by `paymentMethod` —
and applied by the transactions list, the uncategorized counts, the
category-spend **summary**, and the **analysis** tab's month mode (via
`getMonthTransactionWhereForHousehold`). The month picker still anchors its
default selection to the card cycle.

**Analysis tab.** Defaults to the **current month** (the card cycle's current
month) rather than all-time. Selecting a whole month — the default, or any
month via the period picker's quick-picks — uses the payment-method-aware window
(`?month=YYYY-MM`), and every matched transaction is bucketed into that one
month (so a credit-card charge dated in the next calendar month still counts
under its cycle month). Custom multi-month **date ranges** and **All Time** stay
on plain calendar dates and bucket by calendar month (the trend view).

Two related views intentionally keep their own month definition: the **savings**
routes stay on the billing cycle for the whole Savings category (savings rows are
created with the default `credit_card` method and stamped at the cycle start, so
they line up with the summary), and the **analysis** trends bucket by pure
calendar month. These can differ from the summary only for edge-case rows (e.g. a
non-`credit_card` transaction recategorized into Savings near the cycle
boundary).

## Spend by Category view

## Category set up (budget per category)

## Tags

## Auto categorization rules

**Purpose:** Automatically set default categories for new payees based on name pattern matching.

### Payee Category Rules

Rules live on the Payees page in a tabbed UI (Payees / Rules tabs). Each rule has:

- **Name** — human-readable label (e.g., "Supermarkets")
- **Operator** — `contains`, `starts_with`, `ends_with`, `equals` (all case-insensitive)
- **Value** — the string to match against payee names
- **Category** — the target budget category to assign
- **Sort Order** — priority (lower number = higher priority, first match wins)
- **Active** — toggle to enable/disable without deleting

### How rules apply

1. During CSV import, when a new payee is created and has no default category, active rules are checked in sort order
2. The first matching rule sets the payee's default category
3. Once a payee has a default category, all future transactions from that payee use it automatically

### Categorization priority during import

1. Riseup category → budget category mapping (existing)
2. Payee category rules (auto-set payee default)
3. Payee default category fallback (existing)
4. null (uncategorized) — automatically queued for an AI category guess (see
   "AI automatic categorization" below)

### Bulk Apply

"Apply to Existing" button runs all active rules against existing payees that have no default category, reporting how many were matched.

### Backup/Restore

`GET /api/backup` produces a ZIP with one JSON file per table plus `metadata.json`
(current `schemaVersion: 2.3`). `POST /api/restore` wipes the database and
re-inserts everything from a ZIP, in dependency order. Backup and restore are
kept in lockstep — every table the backup captures is also restored, including
the **Areas `pages`**, the full **tasks** module (tasks + categories, tags,
shares), partner contacts, budget account names, cc-generic payee names,
moneytor real-estate (+snapshots), moneytor sync/drop logs, and general logs.
Payee category rules are included too (`payee_category_rules.json`, schema 1.2+).

Intentionally **excluded** (regenerable telemetry / superseded data): raw
`moneytor_transactions`, the old stock-portfolio tables, `verification_tokens`,
`cron_run_logs`, and `budget_categorization_logs` (AI-categorization telemetry).

## AI automatic categorization

**Purpose:** Any expense transaction that the deterministic rules above leave
uncategorized is automatically sent through an LLM (Claude Haiku, with web
search for unfamiliar/Israeli merchants) to guess a budget category. The guess
is surfaced in the UI for one-tap approval — it never sets the category on its
own.

### The guess model

The AI's decision is stored on the transaction as a _suggestion_, separate from
the real category:

- `suggestedCategoryId`, `suggestionConfidence`, `suggestedAt` — the guess. The
  transaction stays uncategorized (`categoryId` null) until the user approves.
- `categorizationAttemptedAt` — set once the AI has been asked about the
  transaction (whatever the outcome), so the automatic pass attempts each
  transaction exactly once instead of re-querying on every run.

Outcomes per transaction (all logged to `BudgetCategorizationLog`):

- **suggested** — confidence ≥ 0.6: the guess is attached and shown.
- **low_confidence** — below 0.6: logged only, no guess attached.
- **no_match** — model found no fitting category: logged only.
- **error** — query failed: logged and `categorizationErrorCount` is bumped. A
  transient failure is retried on later runs; after a few failures the row is
  marked attempted so a persistent failure (e.g. a bad key) can't re-bill it.

Shared logic lives in `lib/ai/suggest-categories.ts`
(`prepareHousehold` + `runSuggestionBatch`). The Anthropic key is resolved per
household (setting first, `ANTHROPIC_API_KEY` env fallback).

### When guessing runs

The automatic passes are all post-response (Next.js `after()`) or folded into an
existing cron, so none blocks a user request. They deliberately avoid needing a
frequent cron, because the Vercel Hobby plan caps crons at once/day and two
total.

1. **Right after import (instant feedback).** The import and CSV-upload routes
   fire a bounded post-response pass via `after()`
   (`lib/ai/background-suggestion.ts` → `runPostImportSuggestion`) so a typical
   import shows suggestions within seconds.
2. **Read-triggered (activity-driven — the main driver).** Whenever the app
   fetches the uncategorized count — i.e. the user is looking at their budget —
   the counts route fires a bounded `after()` pass (`runReadTriggeredSuggestion`)
   over not-yet-attempted rows. This continuously drains the backlog as the user
   browses, needs no cron, and is self-limiting: once every row has been
   attempted it's a no-op.
3. **Daily backstop.** A bounded, time-boxed drain (`drainSuggestions`) is folded
   into the existing `/api/cron/daily-tasks` cron (after Moneytor sync), so rows
   the user never views — e.g. Moneytor-synced transactions — still get attempted
   within a day. No new cron entry (respects the Hobby limits).
4. **Manual / on-demand.** The "Suggest categories" button on the transactions
   page runs on demand and, unlike the automatic passes, re-processes rows even
   if previously attempted. The `/api/cron/suggest-categories` endpoint runs the
   same drain and can be scheduled more frequently on paid plans.

All passes share one wall-clock guard (`deadlineMs`) plus the bounded per-row
error-retry counter, so none can overrun the serverless timeout in a way that
loses work — a killed pass just leaves the remaining rows for the next one.

### Approving a guess

Approving a guess (green check in the suggestion bar) applies the category and
**makes it the payee's default category**, so future transactions from the same
payee are auto-categorized during ingestion. The default is not changed for
payees flagged `neverDefault` or blacklisted. Dismissing (X) just clears the
guess, leaving the transaction uncategorized.

## Account names

**Purpose:** Show a recognizable account/card name in transaction details instead of the raw,
opaque payment identifier.

Transactions carry a `paymentIdentifier`: for Moneytor-synced transactions this is the last 12
characters of Moneytor's account id; for credit-card CSV imports it is the card identifier. These
values are not human-readable on their own.

### Mapping management (Settings → Budget Settings)

The "Account names" block in Budget Settings lets the user map each identifier to a friendly name:

- A list of existing mappings, each editable (rename) and deletable.
- An add form with two inputs: account identifier and friendly name. The identifier input offers a
  `<datalist>` pick-list of identifiers found on the household's transactions that are not yet
  mapped, each annotated with a sample payee and transaction count so the user can recognize it.
- Mappings are scoped to the household and unique per identifier.

Backed by the `BudgetAccountName` model (`@@unique([householdId, accountNumber])`) and the
`/api/budget/account-names` routes (list/create, plus `[id]` rename/delete and an
`identifiers` discovery endpoint).

### Display in transaction details

In the mobile transaction detail dropdown (`TransactionActionsPanel`), an "Account" row shows the
mapped friendly name, falling back to the raw `paymentIdentifier` when no mapping exists. The row is
hidden for transactions without a payment identifier (e.g. manual entries).

## Batch categorization operations

## Edge cases

### Delete category

## Analysis

Const vs. non const expenses

## Stock Portfolio

**Purpose:** Track stock investments across multiple brokerage accounts

### Features

1. **Manage Multiple Accounts**
   - Create account with institution name (e.g., "Fidelity", "Charles Schwab")
   - Select account currency (USD, ILS, EUR, GBP)
   - Optional: Auto-fetch institution logo/icon
   - Rename or delete accounts

2. **Add/Remove Stocks**
   - Add stock: Enter ticker symbol (auto-complete from API)
   - Specify quantity of shares
   - App auto-fetches stock name and current price
   - Remove stock: Select from dropdown, specify quantity to remove

3. **Portfolio View**
   - List of all accounts with total value per account
   - Within each account: list of holdings
     - Stock name, ticker, quantity, current price, total value
     - Gain/loss indicator (if purchase price tracked in future)
   - Portfolio allocation chart (pie chart by stock or by account)

4. **Real-time Pricing**
   - Stock prices fetched from Alpha Vantage or Yahoo Finance API
   - Prices cached and refreshed every 6 hours to avoid API rate limits
   - Historical prices stored in `stock_price_history` table for net worth graph accuracy
   - Background job (cron or Vercel Cron) runs every 6 hours to update prices

### User Flows

**Add New Account:**

1. Click "Add Account" button
2. Enter account name (user-defined)
3. Enter institution name (broker)
4. Select account currency (USD, ILS, EUR, GBP) - determines currency for cost basis entries
5. Account created, now empty

**Add Stock to Account:**

1. Navigate to specific account
2. Click "Add Stock"
3. Type ticker symbol → autocomplete suggestions appear
4. Enter quantity of shares
5. Enter average cost basis (in account's currency)
6. App fetches current price and stock name
7. Stock added to account

**Remove Stock from Account:**

1. Navigate to specific account
2. Click "Remove" next to a stock
3. Enter quantity to remove (validates against current holdings)
4. Stock quantity updated or removed if zero

**View Portfolio Performance:**

1. Navigate to Stock Portfolio section
2. See all accounts and their total values
3. View allocation charts
4. Click individual stocks to see price history (future feature)

## Pension / Keren Hishtalmut

**Purpose:** Track retirement accounts (Pension and Hishtalmut) with deposit history and fee monitoring

### Features

1. **Manage Accounts**
   - Create pension or hishtalmut account
   - Specify provider (e.g., "Meitav", "Altshuler Shaham")
   - Set current total value
   - Define fee structure:
     - Fee from deposit (percentage taken from each deposit)
     - Fee from total (annual management fee percentage)

2. **Track Deposit History**
   - Add deposits with:
     - Deposit date (when money was deposited)
     - Salary month (which month's salary this represents)
     - Amount
     - Employer name
   - View complete deposit history
   - Calculate total deposits over time

3. **Notifications & Alerts**
   - **Quarterly Check:** Every quarter (Jan, Apr, Jul, Oct), system checks if expected deposits were made
     - If missing: Alert "Missing pension deposit for Q[X]"
   - **Anomaly Detection:** If new deposit amount differs significantly from previous deposits (>20% change)
     - Alert: "Deposit amount unusual: $X vs average $Y"

### User Flows

**Add Pension/Hishtalmut Account:**

1. Click "Add Account" in Pension section
2. Select type: Pension or Hishtalmut
3. Enter provider name
4. Enter current total value
5. Set fee percentages (from deposit, from total)
6. Account created

**Record New Deposit:**

1. Navigate to specific pension account
2. Click "Add Deposit"
3. Enter deposit date
4. Select salary month (dropdown)
5. Enter amount
6. Enter employer name
7. Deposit recorded in history

**View Deposit History:**

1. Navigate to pension account
2. See table of all deposits sorted by date
3. See total deposited amount
4. See projected value with fees applied

**Manage Notifications:**

1. System automatically checks quarterly for missing deposits
2. User receives notification in app (red badge)
3. User clicks notification → taken to relevant account
4. Can dismiss or add missing deposit

## Misc. Assets / Debt

**Purpose:** Track other financial instruments: bank deposits, loans, mortgages, child savings accounts

### Asset Types

1. **Bank Deposit** (e.g., savings account, CD)
   - Current amount
   - Annual interest rate
   - Maturity date (for CDs)
   - Calculated: Total interest gain at maturity

2. **Loan**
   - Outstanding balance (negative value)
   - Annual interest rate
   - Monthly payment amount
   - Calculated: Total interest to be paid, payoff date

3. **Mortgage**
   - Outstanding balance (negative value)
   - Annual interest rate
   - Monthly payment amount
   - Maturity/payoff date
   - Calculated: Total interest to be paid
   - **Mortgage Tracks**: Multiple "tracks" per mortgage, each with own:
     - Track name (e.g., "Fixed Rate", "Prime + 1%", "CPI-linked")
     - Amount (outstanding balance for this track)
     - Interest rate (specific to this track)
     - Monthly payment
     - Maturity date
   - Aggregate values calculated from tracks: total amount, weighted avg rate, total payment
   - Displayed in collapsible section on mortgage card

4. **Child Savings**
   - Current amount
   - Monthly deposit amount
   - Annual interest rate
   - Calculated: Projected value at age 18/21

### Features

1. **Add/Edit Assets**
   - Select asset type from dropdown
   - Enter all relevant fields
   - System auto-calculates derived values (total interest, payoff dates)

2. **View All Assets**
   - List view showing all misc assets
   - Separated into: Assets (positive) and Liabilities (negative)
   - Each item shows: name, current value, interest rate
   - Total net value displayed

3. **Interest Calculators**
   - For bank deposits: Calculate maturity value
   - For loans/mortgages: Calculate payoff date and total interest
   - For child savings: Project future value with compound interest

### User Flows

**Add Bank Deposit:**

1. Click "Add Asset"
2. Select "Bank Deposit"
3. Enter name (e.g., "Emergency Fund")
4. Enter current amount
5. Enter interest rate
6. Enter maturity date (if applicable)
7. System calculates projected return
8. Asset saved

**Add Loan/Mortgage:**

1. Click "Add Asset"
2. Select "Loan" or "Mortgage"
3. Enter name (e.g., "Car Loan", "House Mortgage")
4. For Mortgages with multiple tracks:
   - Click "Add Track" button
   - For each track: enter name, amount, interest rate, monthly payment, maturity date
   - Aggregate values (total amount, weighted avg rate, total payment) calculated automatically
   - Can add/remove tracks as needed
5. For simple mortgages (single track) or loans:
   - Enter outstanding balance
   - Enter interest rate and monthly payment
6. System calculates payoff date and total interest
7. Liability saved

**View Mortgage with Tracks:**

1. Navigate to Assets section
2. Locate the mortgage card
3. Click "X Tracks" button to expand collapsible section
4. View each track's details: name, amount, interest rate, payment
5. See per-track interest and payoff projections
6. Click again to collapse

**Add Child Savings:**

1. Click "Add Asset"
2. Select "Child Savings"
3. Enter child's name
4. Enter current amount
5. Enter monthly deposit and interest rate
6. System projects value over time
7. Asset saved

**View Financial Summary:**

1. Navigate to Misc Assets section
2. See all assets grouped by type
3. See total assets vs total liabilities
4. Net value contributes to main dashboard net worth

## Notifications System

**Purpose:** Proactive alerts for important financial events and anomalies

### Notification Types

1. **Missing Pension Deposit**
   - Triggers: Every quarter (Jan 1, Apr 1, Jul 1, Oct 1)
   - Check: Were deposits made for the previous quarter?
   - Alert if no deposits found

2. **Deposit Amount Anomaly**
   - Triggers: When new pension deposit is added
   - Check: Is amount >20% different from average of last 3 deposits?
   - Alert showing: new amount vs. average

3. **Inconsistent Owner State** (future implementation)
   - Triggers: When owner update operation partially fails (rollback attempted)
   - Check: If an account has no owners or owners in unexpected state
   - Alert showing: "Owner assignment for [account name] may be incomplete. Please verify and update owners."
   - Links to the affected account for user to manually fix
   - Note: Currently logged server-side only; UI notification to be implemented

4. **General Info** (future)
   - App updates
   - Upcoming maturity dates for bank deposits
   - Loan payoff milestones

### Notification Features

- **In-App Badge:** Red dot on notifications icon with count
- **Notification Center:** List of all notifications (read/unread)
- **Click to Navigate:** Clicking notification takes user to relevant account/page
- **Dismiss:** Mark as read or delete
- **Settings (future):** Enable/disable specific notification types

### User Flow

1. Background job runs on schedule (daily for checks)
2. System detects condition (missing deposit, anomaly)
3. Creates notification in database
4. User sees badge on next app visit
5. User clicks notifications icon → sees list
6. User clicks specific notification → navigates to relevant page
7. User can mark as read or dismiss

## Pages / Areas (Notion-like documents)

Free-form rich documents for notes, plans, references — anything that doesn't
fit the structured modules. Household-scoped and listed under an **Areas**
section in the sidebar (and mobile menu): an expandable row that lists the
household's pages (emoji + title) with a **New page** button at the bottom.

**A page has:**

- A **title** with an **optional emoji** (Notion-style), both edited inline and
  autosaved. The **emoji picker** is searchable — type a word (e.g. `money`,
  `cat`, `chart`) to filter the bank by name/keyword, or paste a glyph directly;
  pressing Enter picks the top match.
- A **body** built on Tiptap, supporting: headings, bold/italic/strike, bullet
  and numbered lists, quotes, code, **links**, **images**, **tables**, a
  **two-column layout** (columns sit side by side on wide screens, stack on
  mobile), and a typed **database block**.

**RTL / bidirectional text:** text blocks pick their own direction from their
first strong character, so Hebrew blocks render right-to-left and right-aligned
while English blocks stay left-to-right — mixed documents work line by line with
no manual toggle. The `AutoTextDirection` editor extension sets `dir="auto"` on
headings, list items, blockquotes, and code blocks; the page title and database
text cells do the same. Paragraphs deliberately get their direction from CSS
`unicode-bidi: plaintext` instead of a `dir` attribute: a `dir` on an inner
`<p>` would make its parent `<li dir="auto">` skip that text when detecting
direction (per the HTML spec), leaving the bullet on the wrong side. Keeping the
paragraph attribute-free lets the `<li>` detect direction and place its marker on
the item's own start side (right for Hebrew, left for English), even in mixed and
nested lists. List gutters use symmetric `padding-inline` and the blockquote bar
uses `border-inline-start` so both sit correctly regardless of block direction.

**Lists:** indent/outdent via Tab / Shift-Tab or the floating list controls.
Outdenting stops at the top level — a top-level list item can't be lifted out of
the list into a plain paragraph (the outdent control disables itself there).

**Reordering blocks:** on desktop, a six-dot drag handle appears to the left of
the hovered block (HTML5 drag). On mobile/touch, a six-dot grip appears beside
the selected block and reorders top-level blocks via a custom Pointer-Events
drag (with a drop-indicator line and edge auto-scroll) — the desktop handle's
HTML5 drag doesn't work on touch. Mobile reordering is scoped to top-level
blocks (a two-column block moves as a unit; dropping a block inside a column is
not offered).

**Database block:** a Notion-like grid with typed columns (text / number / date /
select / checkbox), click-header sorting, and per-cell editors. Text cells wrap
onto multiple lines. Add a column via the **+** in a trailing narrow header cell,
and add a row via the **+** in a narrow row at the bottom of the table; a new row
always lands at the bottom (any active sort is cleared). Deleting a column asks
for confirmation first. The grid renders borderless (row dividers only) and, on
mobile, spans the full screen width so it reads as embedded in the page.

**Images** are uploaded to **Vercel Blob** (`POST /api/pages/upload`, requires
`BLOB_READ_WRITE_TOKEN`) via the toolbar button or by pasting/dropping an image;
if uploads aren't configured the editor falls back to embedding an image URL.

**Storage:** content is persisted as a Tiptap/ProseMirror JSON document on the
`pages` table (`title`, `emoji`, `content` JSONB, `sort_order`, `owner_id`,
`household_id`). Title/emoji and body edits autosave (debounced) via
`PATCH /api/pages/[id]`. New pages sort to the top of the Areas list.

**Routes:** `/areas/[id]` renders a page in the app shell.
`GET/POST /api/pages`, `GET/PATCH/DELETE /api/pages/[id]`, `POST /api/pages/upload`.

# Development & Deployment

## Code Quality Practices

### Code Organization

- **Feature-based structure:** Group files by feature/domain
  ```
  app/
    dashboard/
    portfolio/
    pension/
    assets/
  lib/
    db/          # Database utilities and Prisma client
    api/         # External API integrations (stocks, etc.)
    utils/       # Shared utilities
    hooks/       # React hooks
  components/
    ui/          # shadcn/ui components
    shared/      # Reusable components
  ```

### Code Standards

- **DRY (Don't Repeat Yourself):** Extract common logic into utilities/hooks
- **Single Responsibility:** Each function/component does one thing well
- **Type Safety:** Use TypeScript types/interfaces for all data structures
- **Naming Conventions:**
  - Components: PascalCase (e.g., `NetWorthCard.tsx`)
  - Files: kebab-case (e.g., `use-stock-price.ts`)
  - Functions: camelCase (e.g., `calculateNetWorth`)
  - Constants: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)

### Linting & Formatting

- **ESLint:** Enforce code quality rules
- **Prettier:** Auto-format on save
- **TypeScript:** Strict mode enabled
- Pre-commit hooks check formatting before allowing commits

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Set up database
npx prisma migrate dev
npx prisma generate

# Run development server
npm run dev
```

### Environment Variables (`.env.local`)

```
DATABASE_URL="postgresql://..."
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXTAUTH_SECRET="generate-random-secret"
NEXTAUTH_URL="http://localhost:3001"
ALPHA_VANTAGE_API_KEY="your-api-key"
```

### Local Testing

- **Run unit tests:** `npm run test`
- **Run tests in watch mode:** `npm run test:watch`
- **Run E2E tests:** `npm run test:e2e`
- **Run all tests:** `npm run test:all`
- **Type check:** `npm run type-check`
- **Lint:** `npm run lint`

### Database Management (Local)

- **View database:** `npx prisma studio`
- **Create migration:** `npx prisma migrate dev --name description`
- **Reset database:** `npx prisma migrate reset`
- **Seed data (optional):** `npx prisma db seed`

## Testing Strategy

### Unit Tests (Jest + React Testing Library)

- **Test Coverage Goals:** 70%+ for critical logic
- **What to Test:**
  - Financial calculations (net worth, interest, projections)
  - Data transformations
  - API utility functions
  - React hooks (custom hooks for data fetching)
- **Mocking:** Use mocks for external APIs, minimal fixtures

### Integration Tests

- API routes (Next.js API endpoints)
- Database operations (using test database)
- External API integrations (mocked)

### End-to-End Tests (Playwright)

- **Critical User Flows:**
  - Login with Google → See dashboard
  - Add stock account → Add stock → See updated portfolio value
  - Add pension deposit → Check notification triggers
  - View net worth graph with real data
- **Run locally:** `npm run test:e2e`
- **Run in CI:** On main branch only

## CI/CD Pipeline (GitHub Actions)

### Workflow: `.github/workflows/ci.yml`

**On Push to Any Branch:**

1. Install dependencies
2. Run TypeScript type check
3. Run ESLint
4. Run Prettier check
5. Run unit tests
6. If all pass → ✅

**On Pull Request:**

- Same as above, plus:
- Preview deployment to Vercel (unique URL)
- Comment on PR with preview link

**On Push to `main` Branch:**

1. All of the above checks
2. If checks pass:
   - Automatic deployment to Vercel production
3. (Optional) Run E2E tests against production

### Environment Variables

Stored in Vercel dashboard and GitHub Secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `ALPHA_VANTAGE_API_KEY`

## Deployment

### Hosting: Vercel

- **Production:** Deploys from `main` branch
- **Preview:** Every PR gets a preview deployment
- **Database:** Vercel Postgres (or Supabase)
- **Domain:** Custom domain connected via Vercel DNS

### Deployment Checklist

1. All tests passing locally
2. Create PR from feature branch
3. Review preview deployment
4. Merge to `main`
5. Auto-deploy to production
6. Verify production deployment
7. Monitor for errors (Vercel logs)

### Background Jobs (Vercel Cron)

- **Stock Price Updates:** Every 6 hours
  - Route: `/api/cron/update-stock-prices`
  - Schedule: `0 */6 * * *`
- **Notification Checks:** Daily at midnight
  - Route: `/api/cron/check-notifications`
  - Schedule: `0 0 * * *`
- **Net Worth Snapshots:** Every two weeks (1st and 15th of month)
  - Route: `/api/cron/create-snapshot`
  - Schedule: `0 0 1,15 * *`
- **AI Categorization Drain:** Folded into the daily-tasks cron (not a separate
  schedule, to stay within the Hobby 2-cron / once-per-day limits). A manual/
  on-demand `/api/cron/suggest-categories` endpoint runs the same drain and can
  be scheduled more frequently on paid plans.
  - Guesses categories for uncategorized expenses not yet attempted (see "AI
    automatic categorization")

Configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/update-stock-prices",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/check-notifications",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/create-snapshot",
      "schedule": "0 0 1,15 * *"
    }
  ]
}
```

## Development Workflow

1. Create feature branch from `main`
2. Develop locally: `npm run dev`
3. Test locally: `npm run test`
4. Commit with descriptive messages
5. Push and create PR
6. Review preview deployment
7. Merge to `main` → auto-deploys to production

## Tech stack

### Frontend

- **Framework:** Next.js 15 (App Router)
  - Full-stack React framework with server and client components
  - Server-side rendering for fast initial loads
  - Built-in API routes for backend logic
- **Language:** TypeScript
  - Type safety for financial calculations
  - Better developer experience with autocomplete
- **Styling:** Tailwind CSS + shadcn/ui
  - Utility-first CSS framework
  - Beautiful, accessible component library
  - Built-in dark mode support
  - Mobile-responsive by default

### Backend

- **Database:** PostgreSQL
  - Relational database for structured financial data
  - ACID compliant (critical for financial accuracy)
  - Supports complex queries for analysis
  - Hosting options: Vercel Postgres or Supabase
- **ORM:** Prisma or Drizzle ORM
  - Type-safe database access
  - Automatic migrations
  - Works seamlessly with TypeScript

### Authentication

- **Provider:** Auth.js (NextAuth.js) with Google SSO
  - Single Sign-On with Google accounts
  - Email allowlist for access control (only you and your wife)
  - Secure session management
  - No password management needed
- **Access Control:**
  ```
  Allowed emails: [your.email@gmail.com, wife.email@gmail.com]
  Any other Google account attempting to sign in will be denied
  ```

### Data Management

- **Data Fetching:** TanStack Query (React Query)
  - Automatic caching and refetching
  - Optimistic updates for instant UI feedback
  - Perfect for fetching stock prices and account data
- **State Management:** Zustand
  - Lightweight global state for UI (filters, view state)
  - Simple API, less boilerplate than Redux

### External APIs

- **Stock Prices:** Alpha Vantage or Yahoo Finance API
  - Real-time and historical stock price data
  - Free tier available (Alpha Vantage: 500 requests/day)
  - Fallback to Yahoo Finance if needed

### Visualization

- **Charts:** Recharts
  - React-native charting library
  - Line charts for net worth over time
  - Bar/pie charts for portfolio allocation
  - Mobile-responsive

### Testing

- **Unit Tests:** Jest + React Testing Library
  - Test financial calculations
  - Test component rendering and interactions
- **E2E Tests:** Playwright
  - Test critical user flows (login, add stock, view portfolio)
  - Run in CI/CD pipeline

### Deployment & Hosting

- **Platform:** Vercel
  - One-command deploy from GitHub
  - Automatic HTTPS and global CDN
  - Environment variables for secrets
  - Free tier for personal projects
  - Preview deployments for every PR

### CI/CD

- **Pipeline:** GitHub Actions
  - Run tests on every push
  - Automatic deployment to Vercel on merge to main
  - Preview deployments for pull requests
  - Lint and type-check before deploy

# Database Schema

## Core Tables

### users

- `id` (UUID, primary key)
- `email` (string, unique) - Google account email
- `name` (string) - User's name from Google
- `image` (string, nullable) - Profile picture URL
- `created_at` (timestamp)
- `updated_at` (timestamp)

### stock_accounts

- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `institution_name` (string) - e.g., "Fidelity", "Charles Schwab"
- `institution_icon_url` (string, nullable) - Fetched logo
- `account_name` (string) - User-defined name, e.g., "Joint Brokerage"
- `currency` (string, default: "USD") - Account currency for cost basis (USD, ILS, EUR, GBP)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### stock_holdings

- `id` (UUID, primary key)
- `account_id` (UUID, foreign key → stock_accounts)
- `ticker` (string) - e.g., "AAPL", "MSFT"
- `stock_name` (string) - e.g., "Apple Inc."
- `quantity` (decimal) - Number of shares
- `created_at` (timestamp)
- `updated_at` (timestamp)
- **Unique constraint:** (account_id, ticker)

### stock_price_history

- `id` (UUID, primary key)
- `ticker` (string, indexed)
- `price` (decimal)
- `currency` (string) - e.g., "USD", "ILS"
- `fetched_at` (timestamp, indexed)
- **Note:** Stores historical price data for portfolio value calculations over time

### pension_accounts

- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `type` (enum: 'pension' | 'hishtalmut')
- `provider_name` (string) - e.g., "Meitav", "Altshuler Shaham"
- `account_name` (string) - User-defined name
- `current_value` (decimal)
- `fee_from_deposit` (decimal) - Percentage, e.g., 0.5 for 0.5%
- `fee_from_total` (decimal) - Percentage
- `created_at` (timestamp)
- `updated_at` (timestamp)

### pension_deposits

- `id` (UUID, primary key)
- `account_id` (UUID, foreign key → pension_accounts)
- `deposit_date` (date)
- `salary_month` (date) - Which month's salary this deposit is for
- `amount` (decimal)
- `employer` (string) - Company name
- `created_at` (timestamp)

### misc_assets

- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `type` (enum: 'bank_deposit' | 'loan' | 'mortgage' | 'child_savings')
- `name` (string) - User-defined name, e.g., "Emergency Fund", "House Mortgage"
- `current_value` (decimal) - For assets: positive, for debts: negative
- `interest_rate` (decimal) - Annual percentage
- `monthly_payment` (decimal, nullable) - For loans/mortgages
- `monthly_deposit` (decimal, nullable) - For savings plans
- `maturity_date` (date, nullable) - When deposit matures or loan ends
- `total_interest` (decimal, calculated) - Total interest gained/paid
- `created_at` (timestamp)
- `updated_at` (timestamp)

### net_worth_snapshots

- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `date` (date, indexed)
- `total_value` (decimal)
- `breakdown` (JSON) - Stores detailed breakdown by category
  ```json
  {
    "stocks": 100000,
    "pension": 50000,
    "assets": 30000,
    "debt": -20000
  }
  ```
- `created_at` (timestamp)
- **Unique constraint:** (user_id, date)
- **Note:** Generated daily or on-demand for the net worth graph

### notifications

- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `type` (enum: 'missing_pension_deposit' | 'deposit_amount_anomaly' | 'inconsistent_owner_state' | 'info')
- `title` (string)
- `message` (text)
- `is_read` (boolean, default: false)
- `related_entity_type` (string, nullable) - e.g., 'pension_account'
- `related_entity_id` (UUID, nullable)
- `created_at` (timestamp, indexed)

### audit_events (optional, for tracking changes)

- `id` (UUID, primary key)
- `user_id` (UUID, foreign key → users)
- `event_type` (string) - e.g., "stock_added", "deposit_recorded"
- `entity_type` (string) - e.g., "stock_holdings", "pension_deposits"
- `entity_id` (UUID)
- `changes` (JSON) - Old and new values
- `created_at` (timestamp, indexed)

## Relationships Summary

- One user → Many stock accounts → Many stock holdings
- One user → Many pension accounts → Many pension deposits
- One user → Many misc assets
- One user → Many net worth snapshots
- One user → Many notifications
- Stock holdings reference stock_price_history via ticker

# Design System & UI Guidelines

## Design Principles

- **Mobile-First:** Design for mobile, enhance for desktop
- **Clean & Minimal:** Financial data should be clear, not cluttered
- **Data-Driven:** Emphasis on numbers, charts, and visual data representation

## Color Scheme

### Light Mode

- **Background:** White (#FFFFFF) and Light Gray (#F9FAFB)
- **Text Primary:** Dark Gray (#111827)
- **Text Secondary:** Medium Gray (#6B7280)
- **Accent Primary:** Blue (#3B82F6) - for buttons, links
- **Accent Secondary:** Indigo (#6366F1)
- **Success:** Green (#10B981) - for positive trends, gains
- **Danger:** Red (#EF4444) - for negative trends, losses
- **Warning:** Amber (#F59E0B) - for alerts, notifications

### Dark Mode (Primary)

- **Deep Base Background:** Warm charcoal `#121417` (near-black with a hint of warmth)
- **Surface / Card Background:** `#1E2125` (the lighter layer that makes cards pop)
- **Text Primary:** Pure White `#FFFFFF`
- **Text Secondary:** Cool Grey `#A0AEC0` (labels, smaller details)
- **Dividers:** Low-contrast `#2D3748`
- **Accent Primary:** Pastel Blue `#A8CAFF`
- **Success:** Pastel Green `#8FDDB0`
- **Danger:** Pastel Red `#F5A5A5`
- **Shadows:** Black at ~15-20% opacity, `0px 8px 24px` (soft, natural drop shadow)
- Tokens live in `app/globals.css` (`.dark`); most UI is token-driven (`bg-background`,
  `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`).

## Typography

- **Font Family:** Lexend (sans-serif) - modern, highly readable, used for both body and headings
- **Headings:**
  - H1: 2.5rem (40px), bold, for main dashboard title
  - H2: 2rem (32px), semibold, for section titles
  - H3: 1.5rem (24px), semibold, for subsections
- **Body:** 1rem (16px), normal weight
- **Small/Caption:** 0.875rem (14px), for labels and secondary info
- **Numbers:** Tabular figures (font-variant-numeric: tabular-nums) for aligned columns

## Layout

### Mobile (< 768px)

- Single column layout
- Full-width cards
- Collapsible navigation menu (hamburger)
- Bottom navigation bar for quick access (Home, Portfolio, Assets, Notifications)

### Tablet/Desktop (≥ 768px)

- Sidebar navigation (fixed left)
- Main content area with responsive grid
- Cards in 2-3 column grid
- Charts expand to full width

## Component Guidelines

### Cards

- Rounded corners (border-radius: 0.5rem)
- Subtle shadow in light mode, border in dark mode
- Padding: 1.5rem
- Hover effect: slight shadow increase

### Buttons

- **Primary:** Accent blue, white text, rounded
- **Secondary:** Transparent with border, accent text
- **Danger:** Red background for destructive actions (delete)
- Hover: Slight darkening or opacity change

### Forms

- Labels above inputs
- Inputs with clear borders
- Validation feedback (green check for valid, red message for errors)
- Auto-focus on first field

### Charts

- Use Recharts with customized colors matching theme
- Tooltips on hover with detailed info
- Responsive to container size
- Grid lines subtle, not distracting

### Navigation

- **Mobile:** Bottom tab bar (4-5 main sections)
- **Desktop:** Left sidebar with icons + text
- Active state clearly indicated (bold, accent color)

## Responsive Breakpoints

- Mobile: 0-767px
- Tablet: 768px-1023px
- Desktop: 1024px+

## Animation & Transitions

- Subtle transitions (200-300ms) for hover states
- Loading skeletons for data fetching
- Smooth scrolling
- Avoid excessive animation (professional, not playful)

# Progressive Web App (PWA)

The Hub AI is installable as a Progressive Web App, so it can be added to a
phone home screen or desktop and launched as a standalone, full-screen app
(no browser chrome).

## Manifest

- Defined in `app/manifest.ts` (served at `/manifest.webmanifest` via Next.js
  metadata routes).
- `display: 'standalone'` — launches full screen without browser UI.
- `start_url` / `scope`: `/`.
- `background_color` / `theme_color`: `#121417` (matches the dark theme base).
- Icons: `192x192` and `512x512` (purpose `any`) plus maskable variants
  (`192x192`, `512x512`), stored in `public/icons/`.

## App Metadata (`app/layout.tsx`)

- `metadata.manifest` links the manifest; `metadata.appleWebApp` enables
  iOS standalone mode with a black-translucent status bar and app title.
- `metadata.icons` declares favicon, PNG icons, and the Apple touch icon
  (`public/icons/apple-touch-icon.png`, 180x180).
- `viewport` exports `themeColor: '#121417'` and `viewportFit: 'cover'`.

## Safe-Area Handling

With `viewportFit: 'cover'` + `appleWebApp.statusBarStyle: 'black-translucent'`,
content extends under the status bar / notch / home indicator in standalone
mode. `.safe-pt` / `.safe-pb` / `.safe-px` utilities in `app/globals.css` add
`env(safe-area-inset-*)` padding (on top of any base padding via
`--safe-*-base` custom properties). Applied to the mobile header (top/sides)
and main content area (sides/bottom) so the UI is never obscured.

## Service Worker (`public/sw.js`)

Registered client-side by `components/shared/service-worker-register.tsx`
(production only, on window load). Caching strategy is deliberately
conservative for a financial app:

- **Cache-first** for immutable, content-hashed build output (`/_next/static`).
- **Stale-while-revalidate** for stable-named static files (icons, fonts) so an
  updated asset propagates without a manual cache-version bump.
- **Network-first** for page navigations, falling back to `public/offline.html`
  when offline.
- **Never cached:** `/api/*`, `/handler/*` (auth), and `/auth*` — sensitive
  financial data and session responses always go to the network.
- Precaching is resilient: `offline.html` is essential; icons are best-effort
  (`Promise.allSettled`) so one failed fetch can't abort install.
- Old cache versions are purged on `activate` (bump `CACHE_VERSION` in `sw.js`
  to invalidate the static cache on deploy). `/sw.js` is served with
  `Cache-Control: max-age=0, must-revalidate` (via `next.config.ts` headers)
  so updated SW logic is picked up promptly.

# Future Features

## Shopping List

- Shared household shopping list
- Add/remove items with quantities
- Mark items as purchased
- Categorize by store sections (produce, dairy, etc.)
- Sync between household members

## Supermarket Cart Scraper

- Scrape supermarket websites to build shopping carts from list
- Auto-populate online grocery carts (e.g., Shufersal, Rami Levy)
- Price comparison across supermarkets
- One-click order preparation

## Monthly Budget

(See placeholder sections above - to be expanded)

## Context 7 Integration

MCP aggregator - to be explored

# Moneytor Integration

Pulls transactions from Moneytor (external aggregator) into a separate, read-only dataset. Kept isolated from `budget_transactions` so the rich budget tooling (categories, payees, tags, splits) is not contaminated with raw external data.

## Components

- **Page** `/moneytor-trnx` — top section: stock holdings grouped by Moneytor account (current price vs. purchase price in green/red, qty, value in ILS, account total + cash). Bottom section: month-scoped transactions list with search/category/type filters. One **Sync now** button covers both.
- **Database:**
  - `moneytor_transactions` — id (Moneytor ULID, PK), transaction_date, amount (signed Decimal), currency, description, category (raw enum string e.g. `BANK_TRANSFER`), account_id, type, household_id, synced_at.
  - `moneytor_stock_holdings` — one row per holding inside a share-form account's `stocksData`. Unique on (household_id, product_id, stock_name). Tracks amount, purchase_price/date, current stock_price, currency, total_worth_in_base (ILS), account_cash.
  - `moneytor_stock_snapshots` — one row per holding per day. Unique on (household_id, snapshot_date, product_id, stock_name). Written on every sync; second sync the same day overwrites today's row. Drives value-over-time chart on `/portfolio/v2`.
  - `moneytor_accounts` — unified table for all non-share Moneytor product forms (currently `bank` + `debt`; schema generic enough to add `crypto`/`pension`/`realestate` later without migration). `balance_in_base` is signed (positive=asset, negative=debt). `raw_data` JSONB column stashes the original Moneytor object.
  - `moneytor_account_snapshots` — one row per account per day. Unique on (household_id, snapshot_date, product_id). Same overwrite-today semantics as the stock snapshots. Powers `/api/moneytor/accounts/history` for sparklines.
- **API routes:**
  - `POST /api/moneytor/sync` — pulls transactions (incremental, 7-day safety window, 100-row `$transaction` chunks) AND share-form assets (full-refresh per account: deletes holdings absent from the latest response, upserts the rest).
  - `GET /api/moneytor/transactions` — filterable list; returns distinct categories and last-sync time.
  - `GET /api/moneytor/stocks` — returns holdings grouped by account, with per-account total and cash.
  - `GET /api/moneytor/portfolio` — returns Moneytor holdings reshaped into the `PortfolioSummary` contract consumed by `/portfolio/v2` (per-account totals/cost-basis/P&L in ILS; per-holding price + cost in native currency).
  - `GET /api/moneytor/portfolio/history?range=1Y` — daily timeseries built from `moneytor_stock_snapshots`. Returns both `points` (total across all accounts per day) and `accounts: [{ productId, points }]` so per-account sparklines can use real data.
  - `GET /api/moneytor/accounts` — bank + debt accounts with per-form totals (bank, debt, netInScope).
  - `GET /api/moneytor/accounts/history?range=1Y` — daily balance timeseries per account.
- **External client** `lib/api/moneytor.ts` — `fetchMoneytorTransactions` + `fetchMoneytorShareAssets`, share a private `moneytorGet` helper that handles auth and typed errors. `MoneytorApiError` covers token-expired / rate-limit / 401 / 403 cases with renewal URL.
- **Auth:** Bearer JWT stored in `MONEYTOR_API_TOKEN` env var (30-day expiry; renew at app.moneytor.co.il/settings#api).

## Behavior

- Manual sync trigger via the page button + automatic daily sync via the `/api/cron/daily-tasks` cron (Task 3).
- Transactions upsert keyed on Moneytor's own id so re-syncs are idempotent.
- Stocks: full refresh per account (delete-then-upsert) since the `/assets` endpoint returns a portfolio snapshot, not deltas — handles removed positions correctly.
- Snapshot history: written on every sync (one row per holding per day); multiple syncs within the same day overwrite today's row. Forward-only history since Moneytor doesn't expose price history.
- Token-expired errors surface inline on the page with a "Renew token" link.
- **Bank + debt account balances**: every sync also upserts `moneytor_accounts` + a per-account daily snapshot. Banks store positive balances; debts (loans, mortgages, credit cards) store **negative** balances so downstream charts get the right sign without per-row logic. Display only — these don't roll into Net Worth (which would double-count any overlapping manual `misc_assets`). The Dashboard's "Moneytor Balances" card shows banks vs debts side by side with totals and last-synced time.
- **Promotion to `budget_transactions`:** every sync also promotes new Moneytor rows into the main budget table so they appear on `/budget/transactions` alongside CSV-imported and manual rows.
  - Insert-only: rows are inserted once and never overwritten. User edits to category/payee/tags/notes are preserved forever; amount/date corrections from Moneytor (rare) don't propagate.
  - Dedup via a new `budget_transactions.moneytor_id` unique column.
  - Conflict with a pre-existing CSV row (same date/payee/amount and no moneytor_id): skip insert and stamp `moneytor_id` onto the existing row so next sync recognises it.
  - Categorization: reuses the existing `PayeeCategoryRule` system (description-based) and existing payee default categories. No Moneytor-category-specific mapping table.
  - Payment method mapped from Moneytor's account `type`: `CARD → credit_card`, `CHECKING → bank_transfer`, `CASH → cash`, else `other`.
  - Sync response includes `budgetCreated` and `budgetSkipped` counts; same fields appear in the daily `cron_run_logs.results.moneytor` JSONB so promotion volume is queryable over time.

## /portfolio/v2 (Moneytor data source)

The "New Design" portfolio page (`/portfolio/v2`) **merges** both data sources: hand-managed accounts from `stock_accounts`/`stock_holdings` and Moneytor-synced accounts from `moneytor_stock_holdings`. Hero totals (value, gain/loss, holdings count, account count) sum across both. Allocation bar combines symbols from both. Per-account sections:

- **Legacy accounts**: keep their Edit/Delete dropdowns and dialogs (writes to `stock_holdings`).
- **Moneytor accounts**: tagged with a small `MONEYTOR` badge, read-only — no edit/delete buttons.

A single "Sync now" button in the hero only triggers Moneytor sync (no effect on legacy accounts; use `/portfolio` for hand-managed CRUD). The performance chart and per-account header sparklines use real `moneytor_stock_snapshots` history; until at least 2 sync days exist the chart shows "Not enough history yet" and sparklines are hidden (never synthetic). A caption under the chart calls out that history is Moneytor-only — legacy accounts contribute to totals but not to chart trend.

Combined totals use each API's pre-aggregated ILS sums (`legacy.totalValue + moneytor.totalValue`) rather than per-account sums, since per-account `totalValue` is in the account's native currency.

Time range tabs (6M/1Y/3Y/5Y/ALL) are shared via a hoisted query. The legacy `/portfolio` page is unchanged. `AccountSparkline` falls back to synthetic generation when no `points` prop is supplied (preserves v1 behavior). Dashboard net-worth card and snapshot cron still read the legacy tables only.
