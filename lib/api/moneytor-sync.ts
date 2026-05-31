import { prisma } from '@/lib/db';
import { fetchMoneytorTransactions, fetchMoneytorShareAssets } from './moneytor';

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

  return {
    householdId,
    fetched: transactions.length,
    upserted: transactions.length,
    stockAccounts: shareAssets.length,
    stocksUpserted,
    snapshotsUpserted,
    latestDate: newLatest?.transactionDate.toISOString().split('T')[0] ?? null,
    syncedAt: new Date().toISOString(),
  };
}
