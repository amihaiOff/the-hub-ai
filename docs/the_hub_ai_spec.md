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

### User Flow

1. User signs in with Google → lands on main dashboard
2. Dashboard auto-calculates current net worth from all sources
3. User can click any card to drill down into details
4. User can change time range for graph

# Monthly Budget

## Spend by Category view

## Category set up (budget per category)

## Tags

## Auto categorization rules

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
4. Enter outstanding balance
5. Enter interest rate and monthly payment
6. System calculates payoff date and total interest
7. Liability saved

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

- **Background:** Dark Gray (#0F172A) and Darker Gray (#1E293B)
- **Text Primary:** Off-White (#F1F5F9)
- **Text Secondary:** Light Gray (#CBD5E1)
- **Accent Primary:** Blue (#60A5FA)
- **Accent Secondary:** Indigo (#818CF8)
- **Success:** Green (#34D399)
- **Danger:** Red (#F87171)
- **Warning:** Amber (#FBBF24)

## Typography

- **Font Family:** Inter (sans-serif) - modern, readable, excellent for numbers
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
