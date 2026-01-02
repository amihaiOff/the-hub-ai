---
name: financial-validation
description: Validate financial calculations, decimal precision, and net worth computations. Use when implementing calculations, working with monetary values, ensuring financial accuracy, or testing edge cases with money.
allowed-tools: Read, Grep, Glob, Bash
---

# Financial Validation for Hub AI

Expert guidance for implementing accurate financial calculations.

## Core Rule

**Always use `Decimal` for money - never JavaScript floats.**

## Database (Prisma)

```prisma
amount        Decimal @db.Decimal(18, 2)  // Currency
quantity      Decimal @db.Decimal(18, 8)  // Fractional shares
```

## Key Formulas

```typescript
// Net Worth
netWorth = stocks + pension + assets - debts

// Portfolio Value
portfolioValue = Σ(quantity × currentPrice)

// Compound Interest: A = P(1 + r/n)^(nt)
```

## Edge Cases to Test

1. Zero values (empty portfolio)
2. Negative values (debts)
3. Very large/small numbers
4. Fractional shares (0.001)
5. Rounding (only at display time)

## Common Mistakes

```typescript
// BAD
const total = items.reduce((sum, i) => sum + i.value, 0);

// GOOD
const total = items.reduce((sum, i) => sum.plus(i.value), new Decimal(0));
```
