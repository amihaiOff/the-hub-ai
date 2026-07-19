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

### SKIP_AUTH Dev Mode - Context/Hooks Not Loading Data

```
Symptom: Pages don't load data in dev mode with SKIP_AUTH enabled
         (e.g., household page shows loading state forever)
Cause: React context/hook is checking `status !== 'authenticated'` to skip
       data fetching. SKIP_AUTH bypasses OAuth server-side but doesn't change
       the NextAuth session status - it stays 'unauthenticated'.
Fix:
  // BAD - blocks dev mode
  if (status !== 'authenticated') {
    return;
  }

  // GOOD - only wait during initial load
  if (status === 'loading') {
    return;
  }

  // Then proceed to fetch data - API routes handle auth via SKIP_AUTH
Note: SKIP_AUTH works server-side (API routes check SKIP_AUTH env var),
      but client-side session status remains 'unauthenticated'.
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

### Prisma Client Not Regenerated After Schema Changes

```
Symptom: API returns 500 error with "Cannot read properties of undefined (reading 'findMany')"
         when accessing a newly added model (e.g., prisma.miscAsset.findMany())
Cause: Prisma client wasn't regenerated after adding/modifying models in schema.prisma
Fix:
  1. Run `npx prisma generate` to regenerate the client
  2. Restart the dev server
  3. The new model should now be available on the prisma client
Note: This commonly happens after running `npx prisma migrate dev` - the migration runs
      but the client isn't always auto-regenerated
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
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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

## First-touch doesn't scroll on iOS — check for synthetic onPointerDown anywhere in the tree

Symptom: mobile user reports "I have to touch twice — first touch does
nothing, second touch scrolls." Persists after `touch-manipulation` and
after making the target's own listener passive.

Cause: react-dom installs document-level non-passive
`pointerdown`/`pointermove` delegates whenever ANY component in the
mounted tree has a JSX synthetic `onPointerDown`/`onPointerMove` — even
on totally unrelated elements (a FAB, a checkbox wrapper doing nothing
but `stopPropagation`). iOS Safari walks up to `document` on scroll
start, sees the non-passive delegate, and stalls the first touch.

Diagnose:

```js
// paste into the browser console on the affected page
const orig = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, fn, opts) {
  if ((type === 'pointerdown' || type === 'pointermove') && this === document) {
    const passive = opts && typeof opts === 'object' ? opts.passive : opts;
    console.log(`[doc listener] ${type} passive=${passive}`, new Error().stack);
  }
  return orig.call(this, type, fn, opts);
};
```

If you see any `passive=undefined` entries with a react-dom stack
(`hydrateRoot` / `listenToNativeEvent`), that's the bug. Fix by removing
every JSX `onPointerDown` / `onPointerMove` on the page and converting
long-press to `useLongPress`'s `bindRef` (native passive). See
`mobile-first-ui` skill for full pattern.

Prior attempts that don't work: adding `touch-action: pan-y` /
`touch-manipulation` to the target, making the target's own listener
passive, or trying to override the delegate's passivity per-target.
None help — the document-scope delegate fires first.

## Tiptap NodeView + Radix Dialog: focus-outside closes the dialog

Symptom: a Radix `Sheet` / `Dialog` rendered inside a Tiptap NodeView
closes as soon as the user changes a node attribute (e.g. tapping a type
button in a mobile column sheet).

Cause: `updateAttributes` (or any `chain().updateAttributes().run()`) can
pull focus back into the ProseMirror editor. Radix treats that focus /
pointer event as an interaction outside the dialog and fires
`onOpenChange(false)`.

Fix: swallow the offending interaction handlers on `SheetContent` /
`DialogContent` so the dialog stays open through attribute updates.
Explicit close paths (built-in X, destructive footer button) still work.

```tsx
<SheetContent
  onPointerDownOutside={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
  onFocusOutside={(e) => e.preventDefault()}
  side="bottom"
>
```

## React 19 lint: no `setState` inside `useEffect` — use a lazy `useState` initializer

Symptom: `Error: Calling setState synchronously within an effect can
trigger cascading renders` on a `useEffect` that seeds local state from a
prop.

Pattern to reach for: **lazy `useState` initializer.** Works when the
component is guaranteed to mount fresh with the correct prop (e.g. keyed
by an id, so a new row/column mounts a new component instance).

```tsx
// BAD in React 19
const [editing, setEditing] = useState(false);
useEffect(() => {
  if (autoStartEdit) setEditing(true);
}, [autoStartEdit]);

// GOOD — initializer runs once on mount
const [editing, setEditing] = useState(() => Boolean(autoStartEdit));
```

If the prop changes across renders and needs to re-trigger, prefer
deriving the value inline (`const editing = autoStartEdit ?? localEditing`)
or hoisting the state to the parent, rather than reaching for an effect.

## Playwright: `click({ force: true })` doesn't always reach the element

`force: true` skips actionability _checks_ but Playwright still dispatches
a real click at the coordinates — if an overlapping element intercepts
pointer events at that point, the click hits the wrong node.

For smoke tests where you know the target and the actionability check is
the only obstacle, drop to a direct DOM click via `page.evaluate`:

```ts
await page.evaluate(() => {
  document.querySelectorAll('.database-block button[aria-label="Column options"]')[1]?.click();
});
```

Works because a synchronous DOM `.click()` bypasses hit-testing entirely.
Only use for scripted tests — real-user simulations should stick to
proper clicks so you catch overlap bugs.

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
