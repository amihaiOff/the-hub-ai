---
name: database-schema
description: Design and modify Prisma schema, create migrations, and manage database changes. Use when working with the data model, adding tables, modifying schema, or running migrations.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Database Schema Expert for Hub AI

Guide for Prisma schema design and migrations.

## Commands

```bash
npx prisma studio                    # Open GUI
npx prisma migrate dev --name desc   # Create migration
npx prisma db push                   # Push without migration
npx prisma generate                  # Regenerate client
npx prisma format                    # Format schema
```

## Schema Structure

```
users                    # Google OAuth users (email allowlist)
  ↓
stock_accounts          # Brokerage accounts
  → stock_holdings      # Individual stocks
  → stock_price_history # Historical prices

pension_accounts        # Retirement/Hishtalmut
  → pension_deposits    # Deposit history

misc_assets             # Bank deposits, loans, mortgages

net_worth_snapshots     # Bi-weekly snapshots (1st & 15th)
notifications           # Missing deposits, anomalies
```

## Key Conventions

```prisma
model Example {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Money fields - always Decimal
  amount    Decimal  @db.Decimal(18, 2)

  // Relations
  userId    String
  user      User     @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

## Backup Coverage (IMPORTANT)

Any new Prisma model that stores **user data** must be added to backup and
restore, or a restore will silently drop it. This has bitten us before —
stock accounts, moneytor transactions, and market rates all shipped without
backup coverage and had to be retrofitted.

**When you add a model, decide up front:**

1. **User data → cover it.** Add to both `/app/api/backup/route.ts` and
   `/app/api/restore/route.ts`, and bump `schemaVersion` in backup (+ add
   the new version to `supportedVersions` in restore).
2. **Regenerable / ephemeral → explicitly skip it, and say why in the
   backup route's opening comment.** Examples: verification tokens, cache
   tables, cron/AI/telemetry logs, market-rate fetch logs (BoI Prime rows
   themselves ARE backed up; only the _fetch_ log is skipped).

**Checklist for a new user-data model:**

- [ ] `backup/route.ts`: add to `findMany` destructuring, `metadata.counts`,
      and `zip.file()` write (filename = snake_case table name + `.json`).
- [ ] `backup/route.ts`: bump `schemaVersion` (e.g. `'2.6'` → `'2.7'`).
- [ ] `restore/route.ts`: add `parseFile` call, add to delete phase in the
      correct dependency order (children before parents), add create loop
      with the model's exact field list.
- [ ] `restore/route.ts`: add the new version to `supportedVersions`.
- [ ] `backup.test.ts` + `restore.test.ts`: update `schemaVersion`
      assertions and add mocks (`prisma.<model>.findMany`, `.create`,
      `.deleteMany`).
- [ ] Confirm `npm test` and `npm run type-check` are green before shipping.

Older backups (with no JSON for the new table) still restore cleanly —
`parseFile` returns `[]` when the file is missing.

## Migration Workflow

1. Modify `prisma/schema.prisma`
2. Run `npx prisma format`
3. Run `npx prisma migrate dev --name descriptive-name`
4. Update TypeScript types if needed
5. Test with `npx prisma studio`

## Query Optimization

### Avoid N+1 Queries with findMany + distinct

Instead of calling `findFirst` in a loop:

```typescript
// BAD: N+1 queries
for (const symbol of symbols) {
  const cached = await prisma.stockPriceHistory.findFirst({
    where: { symbol },
    orderBy: { timestamp: 'desc' },
  });
}

// GOOD: Single query with distinct
const cachedPrices = await prisma.stockPriceHistory.findMany({
  where: { symbol: { in: symbols } },
  orderBy: { timestamp: 'desc' },
  distinct: ['symbol'], // Get latest per symbol
});

// Build Map for O(1) lookup
const cachedMap = new Map(cachedPrices.map((c) => [c.symbol, c]));
```
