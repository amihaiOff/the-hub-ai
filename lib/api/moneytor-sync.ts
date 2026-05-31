import { prisma } from '@/lib/db';
import { fetchMoneytorTransactions, fetchMoneytorShareAssets } from './moneytor';
import { importTransactions } from '@/lib/utils/import-transactions';
import type { ImportTransactionInput } from '@/lib/validations/budget';
import { mapMoneytorTypeToPaymentMethod } from '@/lib/utils/moneytor-mapping';

/**
 * Result of syncing a single household with Moneytor.
 * Same shape returned by the manual sync UI and the cron job.
 */
export interface MoneytorSyncSummary {
  householdId: string;
  fetched: number;
  upserted: number;
  stockAccounts: number;
  stocksUpserted: number;
  snapshotsUpserted: number;
  // Promotion of moneytor_transactions → budget_transactions
  budgetCreated: number;
  budgetSkipped: number;
  latestDate: string | null;
  syncedAt: string;
}

/**
 * Pulls transactions and stock holdings from Moneytor and upserts them locally
 * for a single household.
 *
 * - Transactions: incremental — uses MAX(transaction_date) - 7d as `from`.
 * - Stocks: full refresh per account, then daily snapshot upsert.
 *
 * Throws `MoneytorApiError` on API-side problems (caller decides how to surface them).
 */
export async function syncMoneytorForHousehold(householdId: string): Promise<MoneytorSyncSummary> {
  // ----- Transactions (incremental) -----
  const latest = await prisma.moneytorTransaction.findFirst({
    where: { householdId },
    orderBy: { transactionDate: 'desc' },
    select: { transactionDate: true },
  });

  const SAFETY_DAYS = 7;
  let from: string | undefined;
  if (latest) {
    const windowStart = new Date(latest.transactionDate);
    windowStart.setUTCDate(windowStart.getUTCDate() - SAFETY_DAYS);
    from = windowStart.toISOString().split('T')[0];
  }

  const transactions = await fetchMoneytorTransactions({ from });

  const CHUNK_SIZE = 100;
  for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
    const chunk = transactions.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((tx) =>
        prisma.moneytorTransaction.upsert({
          where: { id: tx.id },
          create: {
            id: tx.id,
            transactionDate: new Date(`${tx.date}T00:00:00Z`),
            amount: tx.amount,
            currency: tx.currency,
            description: tx.description,
            category: tx.category,
            accountId: tx.accountId,
            type: tx.type,
            householdId,
          },
          update: {
            transactionDate: new Date(`${tx.date}T00:00:00Z`),
            amount: tx.amount,
            currency: tx.currency,
            description: tx.description,
            category: tx.category,
            accountId: tx.accountId,
            type: tx.type,
            syncedAt: new Date(),
          },
        })
      )
    );
  }

  // ----- Stock holdings (full refresh per account) + daily snapshot -----
  const shareAssets = await fetchMoneytorShareAssets();
  let stocksUpserted = 0;
  let snapshotsUpserted = 0;

  // Snapshot date = today (UTC). Upsert keyed on (household, date, product, stock) so
  // multiple syncs on the same day overwrite — keeps one row per holding per day.
  const today = new Date();
  const snapshotDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  for (const asset of shareAssets) {
    const productId = String(asset.productId ?? asset.id);
    const holdings = asset.stocksData ?? [];
    const seenStockNames = holdings.map((h) => h.stockName);

    // Remove holdings under this product that are no longer in the response
    await prisma.moneytorStockHolding.deleteMany({
      where: {
        householdId,
        productId,
        ...(seenStockNames.length > 0 ? { stockName: { notIn: seenStockNames } } : {}),
      },
    });

    for (const h of holdings) {
      const totalWorthInBase = h.balanceInBaseCurrency ?? h.totalWorthInBaseCurrency ?? 0;
      const currency = h.currency?.value || 'USD';
      const purchaseDate = h.purchaseDate
        ? new Date(`${h.purchaseDate.slice(0, 10)}T00:00:00Z`)
        : null;

      await prisma.moneytorStockHolding.upsert({
        where: {
          householdId_productId_stockName: {
            householdId,
            productId,
            stockName: h.stockName,
          },
        },
        create: {
          productId,
          accountName: asset.name,
          broker: asset.broker ?? null,
          stockName: h.stockName,
          amount: h.amount,
          purchasePrice: h.purchasePrice ?? null,
          purchaseDate,
          stockPrice: h.stockPrice,
          currency,
          totalWorthInBase,
          accountCash: asset.cash ?? null,
          householdId,
        },
        update: {
          accountName: asset.name,
          broker: asset.broker ?? null,
          amount: h.amount,
          purchasePrice: h.purchasePrice ?? null,
          purchaseDate,
          stockPrice: h.stockPrice,
          currency,
          totalWorthInBase,
          accountCash: asset.cash ?? null,
          syncedAt: new Date(),
        },
      });
      stocksUpserted++;

      await prisma.moneytorStockSnapshot.upsert({
        where: {
          householdId_snapshotDate_productId_stockName: {
            householdId,
            snapshotDate,
            productId,
            stockName: h.stockName,
          },
        },
        create: {
          snapshotDate,
          productId,
          accountName: asset.name,
          stockName: h.stockName,
          amount: h.amount,
          stockPrice: h.stockPrice,
          currency,
          totalWorthInBase,
          accountCash: asset.cash ?? null,
          householdId,
        },
        update: {
          accountName: asset.name,
          amount: h.amount,
          stockPrice: h.stockPrice,
          currency,
          totalWorthInBase,
          accountCash: asset.cash ?? null,
        },
      });
      snapshotsUpserted++;
    }
  }

  const newLatest = await prisma.moneytorTransaction.findFirst({
    where: { householdId },
    orderBy: { transactionDate: 'desc' },
    select: { transactionDate: true },
  });

  // ----- Promote moneytor_transactions → budget_transactions (insert-only) -----
  // Find every moneytor_transaction whose `id` is not yet present in
  // budget_transactions.moneytor_id. Build ImportTransactionInput rows and hand
  // them to the existing importTransactions helper — payee find-or-create,
  // PayeeCategoryRule application, and (date,payee,amount) dedup all just work.
  // Pre-filter here instead of relying on a Prisma relation (avoids an extra FK
  // migration just for this lookup).
  const allMoneytor = await prisma.moneytorTransaction.findMany({
    where: { householdId },
    orderBy: { transactionDate: 'asc' },
  });
  const alreadyPromoted = await prisma.budgetTransaction.findMany({
    where: { householdId, moneytorId: { not: null } },
    select: { moneytorId: true },
  });
  const promotedSet = new Set(
    alreadyPromoted.map((b) => b.moneytorId).filter((id): id is string => id !== null)
  );
  const unpromoted = allMoneytor.filter((m) => !promotedSet.has(m.id));

  let budgetCreated = 0;
  let budgetSkipped = 0;

  if (unpromoted.length > 0) {
    const inputs: ImportTransactionInput[] = unpromoted.map((mt) => {
      const amount = Number(mt.amount);
      return {
        type: amount < 0 ? 'expense' : 'income',
        transactionDate: mt.transactionDate.toISOString().split('T')[0],
        paymentDate: null,
        amountIls: Math.abs(amount),
        currency: mt.currency,
        amountOriginal: Math.abs(amount),
        payeeName: mt.description.trim() || '(no description)',
        riseupCategory: null,
        paymentMethod: mapMoneytorTypeToPaymentMethod(mt.type),
        paymentNumber: null,
        totalPayments: null,
        notes: null,
        source: 'moneytor_sync',
        paymentIdentifier: mt.accountId.slice(-12),
        excludedFromFlow: false,
        moneytorId: mt.id,
      };
    });

    const result = await importTransactions(householdId, inputs);
    budgetCreated = result.created;
    budgetSkipped = result.duplicatesSkipped;
  }

  return {
    householdId,
    fetched: transactions.length,
    upserted: transactions.length,
    stockAccounts: shareAssets.length,
    stocksUpserted,
    snapshotsUpserted,
    budgetCreated,
    budgetSkipped,
    latestDate: newLatest?.transactionDate.toISOString().split('T')[0] ?? null,
    syncedAt: new Date().toISOString(),
  };
}
