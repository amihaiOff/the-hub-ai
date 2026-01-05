---
name: notification-system
description: Implement notification features including missing deposit detection, anomaly alerts, and the notification UI. Use when working with notifications, alerts, pension deposit checks, or the notification cron job.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Notification System for Hub AI

Guide for implementing alerts and notifications.

## Notification Types

| Type                      | Trigger                  | Severity |
| ------------------------- | ------------------------ | -------- |
| `missing_pension_deposit` | No deposit for quarter   | Warning  |
| `deposit_amount_anomaly`  | >20% change from average | Info     |
| `price_update_failed`     | Stock API error          | Error    |

## Architecture

```
Cron Job (daily at midnight)
    ↓
/api/cron/check-notifications
    ↓
Check pension deposits (quarterly)
Detect anomalies (>20% change)
    ↓
Create notification records
    ↓
UI shows badge with unread count
```

## Key Files

- `/app/api/cron/check-notifications/route.ts`
- `/components/NotificationCenter.tsx`
- `notifications` table in Prisma schema

## Database Schema

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // missing_pension_deposit, deposit_amount_anomaly
  title     String
  message   String
  entityId  String?  // Link to related record
  entityType String? // pension_account, stock_holding
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  @@index([userId, read])
}
```

## Missing Deposit Detection

```typescript
async function checkMissingDeposits(userId: string) {
  const accounts = await getPensionAccounts(userId);

  for (const account of accounts) {
    const lastDeposit = await getLastDeposit(account.id);
    const daysSinceDeposit = differenceInDays(new Date(), lastDeposit.date);

    // Quarterly check (90 days)
    if (daysSinceDeposit > 90) {
      await createNotification({
        userId,
        type: 'missing_pension_deposit',
        title: 'Missing Pension Deposit',
        message: `No deposit recorded for ${account.name} in the last quarter`,
        entityId: account.id,
        entityType: 'pension_account',
      });
    }
  }
}
```

## Anomaly Detection

```typescript
async function checkDepositAnomaly(deposit: PensionDeposit) {
  const avgDeposit = await getAverageDeposit(deposit.accountId);
  const percentChange = deposit.amount.minus(avgDeposit).div(avgDeposit).times(100).abs();

  if (percentChange.greaterThan(20)) {
    await createNotification({
      type: 'deposit_amount_anomaly',
      title: 'Unusual Deposit Amount',
      message: `Deposit differs by ${percentChange.toFixed(0)}% from average`,
    });
  }
}
```

## UI Pattern

```tsx
// Notification badge
<Button variant="ghost" className="relative">
  <BellIcon />
  {unreadCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white
                     rounded-full w-5 h-5 text-xs flex items-center justify-center">
      {unreadCount}
    </span>
  )}
</Button>

// Click navigates to related entity
onClick={() => router.push(`/pension/${notification.entityId}`)}
```
