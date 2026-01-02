# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Hub AI is a personal household financial management application for tracking net worth across multiple asset types: stock portfolios, pension/retirement accounts (Hishtalmut), and miscellaneous assets/debts. Built with Next.js for both frontend and backend, it features Google SSO authentication with email allowlist, mobile-first responsive design with dark mode, and automated background jobs for stock price updates and notifications.

## Common Commands

### Development
```bash
npm run dev              # Start dev server on localhost:3000
npm run build           # Build production bundle
npm run start           # Start production server
npm run lint            # Run ESLint
npm run type-check      # Run TypeScript type checking
```

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
- **Authentication:** Auth.js (NextAuth.js) with Google OAuth
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
    auth/            # Auth.js endpoints
    cron/            # Background jobs
    portfolio/       # Portfolio APIs
    pension/         # Pension APIs
    assets/          # Assets APIs
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

- Google SSO via Auth.js
- Email allowlist enforced in sign-in callback
- Only specified emails can access the app
- Session-based authentication
- Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`

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
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
NEXTAUTH_SECRET="random-secret"
NEXTAUTH_URL="http://localhost:3000"  # or production URL
ALPHA_VANTAGE_API_KEY="..."
```

### Deployment

- **Platform:** Vercel (automatic from GitHub)
- **Production:** Deploys from `main` branch
- **Preview:** Every PR gets preview deployment
- **CI/CD:** GitHub Actions runs tests, lint, type-check on every push

### Important Notes

- **Financial accuracy is critical** - use Decimal types, test calculations thoroughly
- **Mobile experience is primary** - test on mobile first
- **Email allowlist** - only specified emails can access (configured in auth callback)
- **Stock prices cached 6 hours** - don't over-fetch external APIs
- **Net worth snapshots bi-weekly** - not daily (to reduce database growth)
