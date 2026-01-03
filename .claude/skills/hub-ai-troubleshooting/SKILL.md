---
name: hub-ai-troubleshooting
description: Troubleshoot common Hub AI issues including auth problems, database issues, API failures, and UI bugs. Use when debugging specific Hub AI functionality or encountering project-specific errors.
allowed-tools: Read, Grep, Glob, Bash
---

# Hub AI Troubleshooting Guide

Common issues and solutions specific to the Hub AI project.

## Authentication Issues

### "Access Denied" or Can't Login

```
Cause: Email not in allowlist
Check: Auth callback in /app/api/auth/[...nextauth]/route.ts
Fix: Add email to allowlist or check GOOGLE_CLIENT_ID
```

### Session Expires Unexpectedly

```
Cause: NEXTAUTH_SECRET changed or missing
Check: .env.local has NEXTAUTH_SECRET
Fix: Ensure consistent secret across environments
```

### OAuth Callback Error

```
Cause: Redirect URI mismatch
Check: Google Console authorized redirect URIs
Fix: Add http://localhost:3000/api/auth/callback/google
```

## Database Issues

### "Database connection failed"

```bash
# Check connection string
echo $DATABASE_URL

# Test connection
npx prisma db pull

# Common fixes:
# 1. Check PostgreSQL is running
# 2. Verify credentials in DATABASE_URL
# 3. Check network/firewall
```

### "Migration failed"

```bash
# Reset if in development
npx prisma migrate reset

# Or fix schema and retry
npx prisma format
npx prisma migrate dev --name fix-schema
```

### Decimal Precision Errors

```
Symptom: Numbers like 0.30000000000000004
Cause: Using JavaScript number instead of Decimal
Fix: Use Prisma Decimal type throughout
```

## API Security

### All API Routes Need Authentication

Every API route that accesses user data or external services must check authentication:

```typescript
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  // ALWAYS add auth check first
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // ... rest of handler
}
```

Protected routes include:
- `/api/stocks/search` - Stock symbol search
- `/api/stocks/price/[symbol]` - Stock price lookup
- `/api/exchange-rates` - Currency exchange rates
- All portfolio, pension, and asset endpoints

## Stock Price API Issues

### "API rate limit exceeded"

```
Cause: Too many requests to Alpha Vantage
Check: /app/api/cron/update-stock-prices logs
Fix:
  1. Respect 6-hour cache
  2. Batch requests
  3. Use cached prices as fallback
```

### "Stock symbol not found"

```
Cause: Invalid ticker or delisted stock
Fix:
  1. Validate symbol before API call
  2. Handle 404 gracefully
  3. Notify user of invalid symbol
```

### Prices Not Updating

```bash
# Check cron job ran
# Vercel Dashboard → Cron Jobs

# Manual trigger
curl http://localhost:3000/api/cron/update-stock-prices

# Check logs for API errors
```

## UI Issues

### Dark Mode Broken

```
Symptom: White flash or wrong colors
Check:
  1. Tailwind dark: classes
  2. HTML class="dark" on root
  3. CSS variables in globals.css
```

### Mobile Layout Broken

```
Symptom: Overflow, unreadable text
Check:
  1. Missing responsive prefixes (sm:, md:)
  2. Fixed widths instead of responsive
  3. Test at 320px viewport
```

### Charts Not Rendering

```
Symptom: Empty or broken charts
Check:
  1. Data format matches Recharts expectations
  2. Container has explicit dimensions
  3. SSR issues (wrap in dynamic import)
```

## Net Worth Calculation Issues

### Wrong Total

```
Debug steps:
1. Check each component separately:
   - Stock portfolio value
   - Pension totals
   - Misc assets
   - Debts (should be subtracted)

2. Verify Decimal arithmetic:
   - Using .plus() not +
   - Using .minus() not -

3. Check for missing data:
   - Null holdings
   - Unlinked accounts
```

### Snapshot Not Created

```
Check:
1. Cron job scheduled for 1st and 15th
2. /api/cron/create-snapshot endpoint works
3. Previous snapshot exists (for comparison)
```

## Notification Issues

### Missing Deposit Alert Not Firing

```
Check:
1. Cron runs daily at midnight
2. 90-day threshold logic
3. Pension account has deposits to compare
```

### Duplicate Notifications

```
Cause: Missing deduplication
Fix: Check for existing unread notification before creating
```

## Quick Diagnostic Commands

```bash
# Check all environment variables
cat .env.local | grep -v "^#"

# Verify Prisma schema
npx prisma validate

# Check for TypeScript errors
npm run type-check

# Run all tests
npm run test

# Check database state
npx prisma studio
```

## When to Reset

If nothing works:

```bash
# 1. Clear Next.js cache
rm -rf .next

# 2. Reinstall dependencies
rm -rf node_modules && npm install

# 3. Regenerate Prisma client
npx prisma generate

# 4. Restart dev server
npm run dev
```
