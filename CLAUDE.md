# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Workflow (IMPORTANT)

**Always follow this workflow for any coding task:**

1. **Debug** (if fixing a bug) - Use `debugging-agent` to investigate root cause before fixing
2. **Code** - Implement the fix/feature
3. **Test** - Use `testing-agent` to verify changes work and don't break existing functionality
4. **Review** - Use `reviewer-agent` to check code quality, security, and best practices
5. **Update Spec** (if applicable) - Update `docs/the_hub_ai_spec.md` when features, architecture, or behavior changes

**This workflow is mandatory.** Do not skip the test and review steps after writing code. The agents should be run in parallel when possible to save time.

Example after completing a coding task:

```
<Task tool call to testing-agent>
<Task tool call to reviewer-agent>
```

**Spec updates:** When implementing new features or changing existing behavior, update the spec file to reflect the current state of the application. Keep the spec as the source of truth for what the app does.

**Stop Hook Feedback:** When stop hooks raise issues or feedback, you MUST automatically address them without waiting for user confirmation. This includes:

- Running missing tests or reviews
- Fixing identified issues
- Completing incomplete workflows
- Do NOT ask the user if you should address the feedback - just do it immediately

## Project Overview

The Hub AI is a personal household financial management application for tracking net worth across multiple asset types: stock portfolios, pension/retirement accounts (Hishtalmut), and miscellaneous assets/debts. Built with Next.js for both frontend and backend, it features Google SSO authentication with email allowlist, mobile-first responsive design with dark mode, and automated background jobs for stock price updates and notifications.

## Common Commands

### Development

```bash
npm run dev -- -p 3001  # Start dev server on localhost:3001 (use port 3001)
npm run build           # Build production bundle
npm run start           # Start production server
npm run lint            # Run ESLint
npm run type-check      # Run TypeScript type checking
```

**Note:** Development server runs on port 3001 (not 3000).

### Pre-commit Hooks (Husky)

The project uses Husky for Git pre-commit hooks. Before each commit, the following checks run automatically:

1. **Prettier** - Auto-formats code
2. **ESLint** - Lints and auto-fixes issues
3. **TypeScript** - Type checking
4. **Jest** - Unit tests (only changed files for speed)

If any check fails, the commit is blocked until issues are fixed.

**Emergency bypass:** Use `git commit --no-verify` to skip hooks (use sparingly).

### Database (Prisma)

```bash
npx prisma studio                    # Open database GUI
npx prisma migrate dev --name [desc] # Create and apply migration
npx prisma generate                  # Generate Prisma Client
npx prisma db push                   # Push schema without migration
npx prisma migrate reset             # Reset database (careful!)
```

### Testing

```bash
npm run test            # Run unit tests (Jest)
npm run test:watch      # Run tests in watch mode
npm run test:e2e        # Run E2E tests (Playwright)
npm run test:all        # Run all tests
```

## Architecture

### Tech Stack

- **Framework:** Next.js 15 (App Router) with TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** Stack Auth (via Neon Auth) with Google OAuth
- **Data Fetching:** TanStack Query (React Query)
- **State:** Zustand for client state
- **Charts:** Recharts
- **Deployment:** Vercel (with Vercel Cron for background jobs)

### Project Structure

```
app/
  dashboard/         # Main dashboard with net worth
  portfolio/         # Stock portfolio management
  pension/           # Pension/Hishtalmut tracking
  assets/            # Misc assets and debt
  api/               # API routes (backend)
    cron/            # Background jobs
    portfolio/       # Portfolio APIs
    pension/         # Pension APIs
    assets/          # Assets APIs
  handler/           # Stack Auth handler routes
lib/
  db/                # Prisma client and utilities
  api/               # External API integrations (stock prices)
  utils/             # Shared utilities
  hooks/             # Custom React hooks
components/
  ui/                # shadcn/ui components
  shared/            # Reusable business components
prisma/
  schema.prisma      # Database schema
  migrations/        # Migration history
```

### Database Schema Overview

**Core Entities:**

- `users` - Google OAuth users (email allowlist)
- `stock_accounts` → `stock_holdings` - Brokerage accounts and their stocks
- `stock_price_history` - Historical prices for portfolio value tracking
- `pension_accounts` → `pension_deposits` - Retirement accounts and deposit history
- `misc_assets` - Bank deposits, loans, mortgages, child savings
- `net_worth_snapshots` - Bi-weekly snapshots for graph (1st and 15th of month)
- `notifications` - System alerts (missing deposits, anomalies)

**Key Relationships:**

- One user has many accounts (stocks, pension, assets)
- Stock accounts have many holdings
- Pension accounts have many deposits
- All contribute to net worth calculation

### Authentication Flow

- Google SSO via Stack Auth (Neon Auth integration)
- Email allowlist enforced via `ALLOWED_EMAILS` environment variable
- Only specified emails can access the app
- Cookie-based session management
- Stack Auth configured in `stack/server.ts` and `stack/client.ts`
- Auth handler at `/handler/[...stack]`

### Background Jobs (Vercel Cron)

Configured in `vercel.json`:

1. **Stock Price Updates** - Every 6 hours (`0 */6 * * *`)
   - Route: `/api/cron/update-stock-prices`
   - Fetches prices from Alpha Vantage/Yahoo Finance
   - Updates `stock_price_history` table

2. **Notification Checks** - Daily at midnight (`0 0 * * *`)
   - Route: `/api/cron/check-notifications`
   - Checks for missing quarterly pension deposits
   - Detects deposit amount anomalies (>20% change)

3. **Net Worth Snapshots** - Bi-weekly (`0 0 1,15 * *`)
   - Route: `/api/cron/create-snapshot`
   - Calculates total net worth from all sources
   - Saves to `net_worth_snapshots` for historical graph

### Key Features

**Stock Portfolio:**

- Multiple brokerage accounts per user
- Real-time stock prices (cached 6 hours)
- Add/remove stocks with quantity tracking
- Portfolio value calculation and allocation charts
- **Stock Symbol Autocomplete:** When adding stocks, symbol input shows suggestions dropdown
  - Uses Yahoo Finance API for comprehensive stock search
  - Searches all major exchanges (NYSE, NASDAQ, TASE, European exchanges)
  - Debounced search (300ms) to avoid excessive API calls
  - Shows symbol, company name, exchange, and currency
  - TASE symbols suffixed with `.TA` (e.g., `TEVA.TA`)
  - Search by English symbol or company name
- **Currency Conversion:** Toggle to display portfolio values in ILS
  - Fetches real-time exchange rates from Yahoo Finance (USD, EUR, GBP to ILS)
  - Rates cached for 1 hour

**Pension/Hishtalmut:**

- Track deposits with salary month attribution
- Fee tracking (from deposit and from total)
- Quarterly deposit checks with notifications
- Anomaly detection for unusual deposit amounts

**Misc Assets:**

- Bank deposits with interest calculation
- Loans and mortgages with payoff projections
- Child savings with compound interest projection
- All contribute to net worth (positive/negative)

**Notifications:**

- In-app notification center
- Badge with unread count
- Click to navigate to relevant entity
- Types: missing_pension_deposit, deposit_amount_anomaly

### Data Fetching Patterns

- Use TanStack Query for server state (API calls)
- Automatic caching and refetching
- Optimistic updates for instant UI feedback
- Example hook: `useQuery(['portfolio', userId], () => fetchPortfolio(userId))`

### Styling & Design

- **Mobile-first responsive design**
- **Dark mode is primary** (light mode secondary)
- **Color scheme:** Blue accents, green for gains, red for losses
- **Typography:** Inter font, tabular figures for numbers
- **Components:** shadcn/ui for consistency
- **Layouts:** Single column mobile, sidebar + grid on desktop

### Financial Calculations

- Net worth = stocks + pension + assets - debt
- Stock portfolio = Σ(quantity × current_price) for all holdings
- Interest calculations use compound interest formulas
- All monetary values stored as `Decimal` in database for precision

### Code Conventions

- **Components:** PascalCase (`NetWorthCard.tsx`)
- **Files:** kebab-case (`use-stock-price.ts`)
- **Functions:** camelCase (`calculateNetWorth`)
- **Constants:** UPPER_SNAKE_CASE (`API_BASE_URL`)
- **DRY principle:** Extract common logic to lib/utils
- **Type safety:** All data structures have TypeScript interfaces

### Testing Strategy

- **Unit tests:** Financial calculations, utilities, hooks (70%+ coverage goal)
- **Integration tests:** API routes, database operations
- **E2E tests:** Critical flows (login, add stock, view portfolio)
- **Mocking:** External APIs mocked, minimal fixtures

### Environment Variables

Required in `.env.local` (local) and Vercel dashboard (production):

```
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_STACK_PROJECT_ID="..."       # Stack Auth project ID (from Neon/Stack dashboard)
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY="..."  # Stack Auth client key
STACK_SECRET_SERVER_KEY="..."            # Stack Auth server key
ALLOWED_EMAILS="email1@example.com,email2@example.com"  # Comma-separated allowlist
ALPHA_VANTAGE_API_KEY="..."
SKIP_AUTH="true"                         # DEV ONLY - bypasses OAuth for local development
```

**Note:** `SKIP_AUTH` only works when `NODE_ENV !== 'production'`. It's safe to have in `.env.local` but will be ignored in production even if accidentally set.

### Deployment

- **Platform:** Vercel (automatic from GitHub)
- **Production URL:** https://the-hub-ai-ten.vercel.app/
- **Production:** Deploys from `main` branch
- **Preview:** Every PR gets preview deployment
- **CI/CD:** GitHub Actions runs tests, lint, type-check on every push

### Git Workflow & Environments

**Branches:**

- `main` - Production branch (deploys to Vercel production)
- `develop` - Development/preview branch (deploys to Vercel preview)

**Environments:**

| Environment | Branch    | Database                | Purpose             |
| ----------- | --------- | ----------------------- | ------------------- |
| Production  | `main`    | Neon (`main` branch)    | Real user data      |
| Preview     | `develop` | Neon (`develop` branch) | Preview deployments |
| Local       | any       | Local Postgres          | Development         |

**Database Branches (Neon):**

The project uses Neon PostgreSQL with database branches that mirror Git branches:

- `main` Neon branch → Production data (connected to Vercel Production)
- `develop` Neon branch → Preview data (connected to Vercel Preview)

**Schema Change Workflow:**

When you need to modify the database schema:

```bash
# 1. Make changes to prisma/schema.prisma

# 2. Create a migration (locally)
npx prisma migrate dev --name descriptive_name

# 3. Apply to local database (automatic with migrate dev)

# 4. Commit the migration files
git add prisma/migrations
git commit -m "feat: add new_field to table"

# 5. Push to develop
git push origin develop
# → CI automatically runs `prisma migrate deploy` against Neon develop branch

# 6. After merging to main
# → CI automatically runs `prisma migrate deploy` against Neon main branch
```

**Local Database Setup:**

```bash
# Local development database
DATABASE_URL="postgresql://amihaio@localhost:5432/hub_ai_dev"
```

**Workflow:**

1. Work on `develop` branch locally with local Postgres
2. Create migrations with `prisma migrate dev`
3. Push to `develop` → triggers preview deployment + auto-migration
4. Create PR from `develop` → `main` when ready
5. Merge to `main` → triggers production deployment + auto-migration
6. Pull main into develop to sync branches:
   ```bash
   git checkout develop && git pull origin main && git push origin develop
   ```

**Local Database Commands:**

```bash
# Create new migration (use this for schema changes)
npx prisma migrate dev --name [description]

# Apply pending migrations
npx prisma migrate deploy

# Reset database (careful - deletes all data!)
npx prisma migrate reset

# Push schema without migration (dev only, not recommended)
npx prisma db push
```

### Important Notes

- **Financial accuracy is critical** - use Decimal types, test calculations thoroughly
- **Mobile experience is primary** - test on mobile first
- **Email allowlist** - only specified emails can access (configured in auth callback)
- **Stock prices cached 6 hours** - don't over-fetch external APIs
- **Net worth snapshots bi-weekly** - not daily (to reduce database growth)

  ## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
