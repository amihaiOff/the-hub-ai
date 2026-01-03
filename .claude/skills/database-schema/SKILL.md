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
  distinct: ['symbol'],  // Get latest per symbol
});

// Build Map for O(1) lookup
const cachedMap = new Map(cachedPrices.map(c => [c.symbol, c]));
```
