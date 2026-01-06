# Hub AI Learning Log

This file captures lessons learned, error patterns, and solutions discovered during development.
Periodically run `/update-skills` to incorporate these into the appropriate skills.

---

## Format

Each entry should include:

- **Date**: When discovered
- **Category**: error-recovery | troubleshooting | financial | database | api | ui | notifications
- **Problem**: What went wrong
- **Solution**: What fixed it
- **Skill**: Which skill should be updated

---

## Entries

### [INCORPORATED] Exchange Rates Direction Convention

- **Date**: 2026-01-03
- **Category**: api
- **Problem**: Currency conversion was wrong - used `rates.ILS` (always 1) instead of `rates.USD` for USD/ILS conversion
- **Solution**: Exchange rates from Yahoo Finance are TO ILS (e.g., rates.USD = 3.18 means 1 USD = 3.18 ILS). When converting USD to ILS, multiply by rates.USD. When converting ILS to USD, divide by rates.USD. Do NOT use rates.ILS for conversion (it's always 1).
- **Skill**: stock-api-integration

---

### [INCORPORATED] Jest resetAllMocks vs clearAllMocks

- **Date**: 2026-01-03
- **Category**: error-recovery
- **Problem**: Tests passed individually but failed when run together - mock state was leaking between tests
- **Solution**: Use `jest.resetAllMocks()` instead of `jest.clearAllMocks()` in beforeEach. `clearAllMocks` only clears call history but keeps mock implementations. `resetAllMocks` fully resets mock state including implementations, ensuring proper test isolation.
- **Skill**: error-recovery

---

### [INCORPORATED] Public API Routes Need Authentication

- **Date**: 2026-01-03
- **Category**: troubleshooting
- **Problem**: Stock search, stock price, and exchange rates APIs were publicly accessible without authentication, creating security vulnerability
- **Solution**: All API routes that access user data or external services should check authentication using `getCurrentUser()` and return 401 Unauthorized if no user. Add this check at the start of every API route handler.
- **Skill**: hub-ai-troubleshooting

---

### [INCORPORATED] Avoid N+1 Queries with Prisma findMany + distinct

- **Date**: 2026-01-03
- **Category**: database
- **Problem**: `getStockPrices()` was calling `findFirst` in a loop for each symbol, causing N+1 database queries
- **Solution**: Use `prisma.findMany({ where: { symbol: { in: symbols } }, orderBy: { timestamp: 'desc' }, distinct: ['symbol'] })` to fetch all records in a single query. Build a Map from results for O(1) lookup.
- **Skill**: database-schema

---

### [INCORPORATED] Memoize Expensive Formatting Functions

- **Date**: 2026-01-03
- **Category**: ui
- **Problem**: `formatDisplayValue` in HoldingsTable was recreated on every render, causing unnecessary recalculations
- **Solution**: Wrap formatting functions that depend on props/state with `useCallback` and include all dependencies. This prevents unnecessary recalculations when parent components re-render.
- **Skill**: mobile-first-ui

---

### [INCORPORATED] Prisma Client Not Regenerated After Schema Changes

- **Date**: 2026-01-05
- **Category**: database
- **Problem**: API returns 500 error with "Cannot read properties of undefined (reading 'findMany')" when accessing a newly added model (e.g., `prisma.miscAsset.findMany()`)
- **Solution**: After adding new models to Prisma schema, always run `npx prisma generate` to regenerate the Prisma client. The client doesn't auto-update when schema changes. After regenerating, restart the dev server for changes to take effect.
- **Skill**: hub-ai-troubleshooting

---

### [INCORPORATED] SKIP_AUTH Dev Mode Session Status

- **Date**: 2026-01-06
- **Category**: troubleshooting
- **Problem**: Household page didn't load in dev mode with SKIP_AUTH enabled. The HouseholdProvider was checking `status !== 'authenticated'` to skip data fetching, but SKIP_AUTH bypasses OAuth without setting session status to 'authenticated' - it stays 'unauthenticated'.
- **Solution**: When checking auth status in React contexts/hooks, use `status === 'loading'` to wait for session resolution, not `status !== 'authenticated'`. This allows both real auth (status becomes 'authenticated') and dev mode bypass (status stays 'unauthenticated' but API calls still work due to SKIP_AUTH server-side bypass) to function correctly.
- **Skill**: hub-ai-troubleshooting

---

<!-- New entries go here -->
