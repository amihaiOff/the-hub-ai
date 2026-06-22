import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  fetchMoneytorTransactions,
  fetchMoneytorAssets,
  type MoneytorAsset,
  type MoneytorBankAsset,
  type MoneytorDebtAsset,
  type MoneytorPensionAsset,
  type MoneytorShareAsset,
} from './moneytor';
import { importTransactions } from '@/lib/utils/import-transactions';
import type { ImportTransactionInput } from '@/lib/validations/budget';
import { mapMoneytorTypeToPaymentMethod } from '@/lib/utils/moneytor-mapping';

/**
 * Hard floor for any Moneytor data flowing into budget_transactions. Anything
 * earlier than this is considered "already imported via CSV" and is ignored —
 * both at fetch time (don't ask Moneytor for it) and at promotion time (don't
 * insert it into budget_transactions even if it's already in moneytor_transactions).
 *
 * Keep these in sync if the cutoff ever moves.
 */
const INITIAL_SYNC_FROM = '2026-05-01';
const INITIAL_SYNC_FROM_DATE = new Date(`${INITIAL_SYNC_FROM}T00:00:00Z`);

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
  accountsUpserted: number;
  accountSnapshotsUpserted: number;
  pensionFundsUpserted: number;
  pensionSnapshotsUpserted: number;
  // Promotion of moneytor_transactions → budget_transactions
  budgetCreated: number;
  budgetSkipped: number;
  latestDate: string | null;
  syncedAt: string;
}

/**
 * Number of trailing days the daily sync re-aligns with Moneytor on every run.
 * The incremental upsert path can drift from Moneytor when their data is
 * corrected post-fact — running a force-resync over this rolling window each
 * day keeps the local copy faithful to what Moneytor currently returns.
 *
 * Tradeoff: any budget_transaction that lived in this window but is no longer
 * returned by Moneytor will be deleted on the next sync. Those deletions are
 * recorded in `moneytor_drop_logs` so the user can review them via the Labs
 * tab and re-create anything that shouldn't have been dropped.
 */
const ROLLING_ALIGN_DAYS = 14;

/**
 * Pulls transactions and stock holdings from Moneytor and upserts them locally
 * for a single household.
 *
 * - Transactions: incremental upsert for everything from MAX(transaction_date)
 *   - 7d, then a force-resync over the trailing ROLLING_ALIGN_DAYS so the
 *   most recent window always mirrors Moneytor exactly.
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

  // On the very first sync (no stored transactions yet) we only pull from
  // INITIAL_SYNC_FROM onward so we don't overwrite/duplicate transactions
  // that were already imported for earlier months by other means.
  const SAFETY_DAYS = 7;
  let from: string | undefined;
  if (latest) {
    const windowStart = new Date(latest.transactionDate);
    windowStart.setUTCDate(windowStart.getUTCDate() - SAFETY_DAYS);
    from = windowStart.toISOString().split('T')[0];
  } else {
    from = INITIAL_SYNC_FROM;
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

  // ----- Assets (one /assets call returns share + bank + debt + pension) -----
  const allAssets = await fetchMoneytorAssets();
  const shareAssets = allAssets.filter(
    (a): a is MoneytorAsset & MoneytorShareAsset => a.form === 'share'
  );
  const bankAssets = allAssets.filter(
    (a): a is MoneytorAsset & MoneytorBankAsset => a.form === 'bank'
  );
  const debtAssets = allAssets.filter(
    (a): a is MoneytorAsset & MoneytorDebtAsset => a.form === 'debt'
  );
  const pensionAssets = allAssets.filter(
    (a): a is MoneytorAsset & MoneytorPensionAsset => a.form === 'pension'
  );

  // ----- Stock holdings (full refresh per account) + daily snapshot -----
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
  //
  // Hard floor on transactionDate >= INITIAL_SYNC_FROM. moneytor_transactions may
  // still contain older rows from before this guard existed; they must not be
  // promoted because they'd duplicate CSV imports for those months.
  const allMoneytor = await prisma.moneytorTransaction.findMany({
    where: {
      householdId,
      transactionDate: { gte: INITIAL_SYNC_FROM_DATE },
    },
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

  // ----- Bank + debt accounts -----
  // One row per Moneytor product in `moneytor_accounts`; one row per (account, today)
  // in `moneytor_account_snapshots`. Debts are stored with a negative balance so
  // downstream charts get the correct sign without per-row logic.
  let accountsUpserted = 0;
  let accountSnapshotsUpserted = 0;

  for (const asset of [...bankAssets, ...debtAssets]) {
    const productId = String(asset.productId ?? asset.id);
    const isDebt = asset.form === 'debt';
    const balanceInBaseRaw = Number(asset.balanceInBaseCurrency ?? 0);
    const balanceInBase = isDebt ? -Math.abs(balanceInBaseRaw) : balanceInBaseRaw;
    const currency = asset.currency?.value || 'ILS';

    let institution: string | null = null;
    let subtype: string | null = null;
    let accountNumber: string | null = null;
    let interestRate: number | null = null;
    let maturityDate: Date | null = null;
    let monthlyPayment: number | null = null;

    if (asset.form === 'bank') {
      const b = asset as MoneytorBankAsset;
      institution = b.bank ?? null;
      subtype = b.accountType?.value ?? null;
      accountNumber = b.accountNumber != null ? String(b.accountNumber) : null;
      interestRate = b.interest ?? null;
      maturityDate = b.maturityDate ? new Date(`${b.maturityDate.slice(0, 10)}T00:00:00Z`) : null;
    } else {
      const d = asset as MoneytorDebtAsset;
      institution = d.debtInstitution ?? null;
      subtype = d.debtType ?? null;
      const routes = d.routesData ?? [];
      // weighted-average interest by remainder; null if no remainder info
      const totalRemainder = routes.reduce((s, r) => s + Number(r.remainder ?? 0), 0);
      if (totalRemainder > 0) {
        interestRate =
          routes.reduce((s, r) => s + Number(r.interest ?? 0) * Number(r.remainder ?? 0), 0) /
          totalRemainder;
      }
      monthlyPayment = routes.reduce((s, r) => s + Number(r.monthlyRepayment ?? 0), 0) || null;
    }

    await prisma.moneytorAccount.upsert({
      where: { householdId_productId: { householdId, productId } },
      create: {
        productId,
        form: asset.form,
        name: asset.name,
        institution,
        subtype,
        accountNumber,
        currency,
        balanceInBase,
        interestRate,
        maturityDate,
        monthlyPayment,
        rawData: asset as unknown as Prisma.InputJsonValue,
        householdId,
      },
      update: {
        form: asset.form,
        name: asset.name,
        institution,
        subtype,
        accountNumber,
        currency,
        balanceInBase,
        interestRate,
        maturityDate,
        monthlyPayment,
        rawData: asset as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    accountsUpserted++;

    await prisma.moneytorAccountSnapshot.upsert({
      where: {
        householdId_snapshotDate_productId: {
          householdId,
          snapshotDate,
          productId,
        },
      },
      create: {
        snapshotDate,
        productId,
        form: asset.form,
        name: asset.name,
        balanceInBase,
        currency,
        householdId,
      },
      update: {
        form: asset.form,
        name: asset.name,
        balanceInBase,
        currency,
      },
    });
    accountSnapshotsUpserted++;
  }

  // ----- Pension + hishtalmut funds -----
  // One row per (productId, routeName). A single fund with multiple investment
  // tracks shows up as multiple rows from Moneytor — we keep them separate.
  // Snapshot frequency is monthly: bucket date is the first of the current
  // month (UTC). Subsequent syncs in the same month overwrite the row, so the
  // snapshot ends up reflecting the latest observation for that month.
  let pensionFundsUpserted = 0;
  let pensionSnapshotsUpserted = 0;

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  // Remove fund rows no longer present in the response (entire household).
  const seenPensionKeys = new Set(
    pensionAssets.map((a) => `${String(a.productId ?? a.id)}::${(a.route?.value ?? '').trim()}`)
  );
  const existingPensionFunds = await prisma.moneytorPensionFund.findMany({
    where: { householdId },
    select: { id: true, productId: true, routeName: true },
  });
  const toDelete = existingPensionFunds
    .filter((f) => !seenPensionKeys.has(`${f.productId}::${f.routeName}`))
    .map((f) => f.id);
  if (toDelete.length > 0) {
    await prisma.moneytorPensionFund.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (const asset of pensionAssets) {
    const productId = String(asset.productId ?? asset.id);
    const routeName = (asset.route?.value ?? '').trim() || 'default';
    const productType = asset.productType?.value ?? 'unknown';
    const institution = asset.institution?.value ?? null;
    const balanceInBase = Number(asset.balanceInBaseCurrency ?? asset.amount ?? 0);
    const amount = Number(asset.amount ?? balanceInBase);
    const currency = asset.currency?.value || 'ILS';
    const fundOpening = asset.fundOpeningDate
      ? new Date(`${asset.fundOpeningDate.slice(0, 10)}T00:00:00Z`)
      : null;
    const taarichLeyda = asset.taarichLeyda
      ? new Date(`${asset.taarichLeyda.slice(0, 10)}T00:00:00Z`)
      : null;

    await prisma.moneytorPensionFund.upsert({
      where: {
        householdId_productId_routeName: { householdId, productId, routeName },
      },
      create: {
        productId,
        routeName,
        routeCode: asset.investmentDistribution?.[0]?.routeCode ?? null,
        name: asset.name,
        institution,
        productType,
        sugKupa: asset.sugKupa != null && asset.sugKupa !== '' ? Number(asset.sugKupa) : null,
        sugKerenPensia: asset.sugKerenPensia ?? null,
        accountNumber: asset.accountNumber != null ? String(asset.accountNumber) : null,
        accountOwner: asset.accountOwner ?? null,
        fundId: asset.fundId ?? null,
        fundOpeningDate: fundOpening,
        amount,
        currency,
        balanceInBase,
        profitsFromLastYear: asset.profitsFromLastYear ?? null,
        monthlyDepositEmployee: asset.monthlyDepositEmployee ?? null,
        monthlyDepositEmployer: asset.monthlyDepositEmployer ?? null,
        monthlyDepositSum: asset.monthlyDepositSum ?? null,
        depositFrequency: asset.depositFrequency?.value ?? null,
        employerProvisionPct: asset.employerProvisionPercentage ?? null,
        compensationProvisionPct: asset.compensationProvisionPercentage ?? null,
        mgmtFeeFromSavings: asset.managementFeeFromSavings ?? null,
        mgmtFeeFromDeposit: asset.managementFeeFromDeposit ?? null,
        projectedMonthlyPension: asset.projectedMonthlyPension ?? null,
        projectedSavingsWithPremiums: asset.projectedSavingsWithPremiums ?? null,
        projectedSavingsWithoutPremiums: asset.projectedSavingsWithoutPremiums ?? null,
        yearsToRetirement: asset.yearsToRetirement ?? null,
        gilPrisha: asset.gilPrisha ?? null,
        sumHafkadotPitsuyim: asset.sumHafkadotPitsuyim ?? null,
        sumHafkadotLoPitsuyim: asset.sumHafkadotLoPitsuyim ?? null,
        pitzuimMaasikNochechi: asset.pitzuimMaasikNochechi ?? null,
        pitzuimMarkivLemas: asset.pitzuimMarkivLemas ?? null,
        gender: asset.gender ?? null,
        taarichLeyda,
        matsavMishpachti: asset.matsavMishpachti ?? null,
        rawData: asset as unknown as Prisma.InputJsonValue,
        householdId,
      },
      update: {
        routeCode: asset.investmentDistribution?.[0]?.routeCode ?? null,
        name: asset.name,
        institution,
        productType,
        sugKupa: asset.sugKupa != null && asset.sugKupa !== '' ? Number(asset.sugKupa) : null,
        sugKerenPensia: asset.sugKerenPensia ?? null,
        accountNumber: asset.accountNumber != null ? String(asset.accountNumber) : null,
        accountOwner: asset.accountOwner ?? null,
        fundId: asset.fundId ?? null,
        fundOpeningDate: fundOpening,
        amount,
        currency,
        balanceInBase,
        profitsFromLastYear: asset.profitsFromLastYear ?? null,
        monthlyDepositEmployee: asset.monthlyDepositEmployee ?? null,
        monthlyDepositEmployer: asset.monthlyDepositEmployer ?? null,
        monthlyDepositSum: asset.monthlyDepositSum ?? null,
        depositFrequency: asset.depositFrequency?.value ?? null,
        employerProvisionPct: asset.employerProvisionPercentage ?? null,
        compensationProvisionPct: asset.compensationProvisionPercentage ?? null,
        mgmtFeeFromSavings: asset.managementFeeFromSavings ?? null,
        mgmtFeeFromDeposit: asset.managementFeeFromDeposit ?? null,
        projectedMonthlyPension: asset.projectedMonthlyPension ?? null,
        projectedSavingsWithPremiums: asset.projectedSavingsWithPremiums ?? null,
        projectedSavingsWithoutPremiums: asset.projectedSavingsWithoutPremiums ?? null,
        yearsToRetirement: asset.yearsToRetirement ?? null,
        gilPrisha: asset.gilPrisha ?? null,
        sumHafkadotPitsuyim: asset.sumHafkadotPitsuyim ?? null,
        sumHafkadotLoPitsuyim: asset.sumHafkadotLoPitsuyim ?? null,
        pitzuimMaasikNochechi: asset.pitzuimMaasikNochechi ?? null,
        pitzuimMarkivLemas: asset.pitzuimMarkivLemas ?? null,
        gender: asset.gender ?? null,
        taarichLeyda,
        matsavMishpachti: asset.matsavMishpachti ?? null,
        rawData: asset as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    pensionFundsUpserted++;

    await prisma.moneytorPensionSnapshot.upsert({
      where: {
        householdId_snapshotMonth_productId_routeName: {
          householdId,
          snapshotMonth: monthStart,
          productId,
          routeName,
        },
      },
      create: {
        snapshotMonth: monthStart,
        productId,
        routeName,
        name: asset.name,
        institution,
        productType,
        amount,
        balanceInBase,
        currency,
        monthlyDepositSum: asset.monthlyDepositSum ?? null,
        profitsFromLastYear: asset.profitsFromLastYear ?? null,
        householdId,
      },
      update: {
        name: asset.name,
        institution,
        productType,
        amount,
        balanceInBase,
        currency,
        monthlyDepositSum: asset.monthlyDepositSum ?? null,
        profitsFromLastYear: asset.profitsFromLastYear ?? null,
      },
    });
    pensionSnapshotsUpserted++;
  }

  // ----- Rolling re-alignment of the last ROLLING_ALIGN_DAYS days -----
  // The incremental upsert above can leave stale rows around when Moneytor
  // corrects or removes a transaction post-fact (e.g. a pending CC auth that
  // never settles). Run force-resync over a fixed trailing window so the
  // last fortnight always mirrors Moneytor exactly. Dropped budget rows are
  // captured in moneytor_drop_logs by the force-resync routine.
  const todayUtc = new Date();
  const rollingFrom = new Date(
    Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate())
  );
  rollingFrom.setUTCDate(rollingFrom.getUTCDate() - ROLLING_ALIGN_DAYS);
  const rollingFromStr =
    rollingFrom < INITIAL_SYNC_FROM_DATE
      ? INITIAL_SYNC_FROM
      : rollingFrom.toISOString().split('T')[0];
  const rollingToStr = todayUtc.toISOString().split('T')[0];

  let rollingResync: ForceResyncSummary | null = null;
  if (rollingFromStr <= rollingToStr) {
    try {
      rollingResync = await forceResyncMoneytorTransactionsForHousehold(householdId, {
        from: rollingFromStr,
        to: rollingToStr,
      });
    } catch (err) {
      // A failure here must not break the rest of the sync — log and continue.
      console.error('Rolling re-align failed (continuing):', err);
    }
  }

  return {
    householdId,
    fetched: transactions.length + (rollingResync?.fetched ?? 0),
    upserted: transactions.length + (rollingResync?.upserted ?? 0),
    stockAccounts: shareAssets.length,
    stocksUpserted,
    snapshotsUpserted,
    accountsUpserted,
    accountSnapshotsUpserted,
    pensionFundsUpserted,
    pensionSnapshotsUpserted,
    budgetCreated: budgetCreated + (rollingResync?.budgetCreated ?? 0),
    budgetSkipped,
    latestDate: newLatest?.transactionDate.toISOString().split('T')[0] ?? null,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Destructive transaction-only re-sync. Used when Moneytor has corrected data
 * on their side and the normal upsert-based sync doesn't pick the change up.
 *
 * Fetches fresh data for [from, to], then greedy fuzzy-matches each fresh row
 * to an existing one by (description, transactionDate, amount, accountId). On
 * a match: the existing `budget_transaction` is re-pointed to the fresh
 * Moneytor id, preserving the user's category / notes / tags / payee /
 * excludedFromFlow. Old Moneytor rows without a fresh match are deleted along
 * with any linked budget_transactions. The fresh Moneytor row stamps
 * `replacesMoneytorId` for audit.
 */
export interface ForceResyncSummary {
  householdId: string;
  from: string;
  to: string;
  deletedMoneytor: number;
  deletedBudget: number;
  fetched: number;
  upserted: number;
  budgetCreated: number;
  editsPreserved: number;
  syncedAt: string;
}

export interface ForceResyncOptions {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export class ForceResyncRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForceResyncRangeError';
  }
}

/**
 * Key used to recognize a fresh Moneytor row as the "same logical transaction"
 * as one we already had stored — even if Moneytor reassigned its id during a
 * data correction. The mark on `moneytor_transactions.replaces_moneytor_id`
 * records the previous id this row supersedes.
 */
function fuzzyKey(input: {
  description: string;
  transactionDate: Date;
  amount: number | { toString(): string };
  accountId: string;
}): string {
  const dateStr = input.transactionDate.toISOString().split('T')[0];
  const amountStr = String(input.amount);
  // description is normalized only by trim — Moneytor returns the same string
  // when nothing was changed about the description.
  return `${input.description.trim()}|${dateStr}|${amountStr}|${input.accountId}`;
}

export async function forceResyncMoneytorTransactionsForHousehold(
  householdId: string,
  opts: ForceResyncOptions
): Promise<ForceResyncSummary> {
  const { from, to } = opts;

  if (from > to) {
    throw new ForceResyncRangeError('from must be on or before to');
  }
  if (from < INITIAL_SYNC_FROM) {
    throw new ForceResyncRangeError(
      `Cannot force re-sync earlier than ${INITIAL_SYNC_FROM} — pre-cutoff months were imported via CSV.`
    );
  }

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  // 1. Snapshot existing moneytor rows in range with the fields we'll fuzzy-
  // match on. We can't drop them yet — we need them to drive the match.
  const existingMoneytor = await prisma.moneytorTransaction.findMany({
    where: {
      householdId,
      transactionDate: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      description: true,
      transactionDate: true,
      amount: true,
      accountId: true,
    },
  });

  // 2. Fetch fresh data from Moneytor.
  const fresh = await fetchMoneytorTransactions({ from, to });

  // 3. Greedy fuzzy match: for each fresh row, find the first not-yet-consumed
  // existing row with the same (description, date, amount, accountId). Records
  // the link as freshId → oldId so we can later (a) write `replacesMoneytorId`
  // and (b) re-point any budget_transaction.moneytorId from old to fresh.
  const existingByKey = new Map<string, string[]>(); // key → queue of existing ids
  for (const e of existingMoneytor) {
    const k = fuzzyKey({
      description: e.description,
      transactionDate: e.transactionDate,
      amount: Number(e.amount),
      accountId: e.accountId,
    });
    const list = existingByKey.get(k) ?? [];
    list.push(e.id);
    existingByKey.set(k, list);
  }
  const freshToOld = new Map<string, string>(); // freshId → oldId
  for (const f of fresh) {
    const k = fuzzyKey({
      description: f.description,
      transactionDate: new Date(`${f.date}T00:00:00Z`),
      amount: f.amount,
      accountId: f.accountId,
    });
    const queue = existingByKey.get(k);
    if (queue && queue.length > 0) {
      const oldId = queue.shift()!;
      freshToOld.set(f.id, oldId);
    }
  }
  const matchedOldIds = new Set(freshToOld.values());

  // 4. Insert fresh moneytor rows. New ids get a fresh row; ids that already
  // exist (Moneytor kept the id) get upserted in place. When a fresh row is a
  // fuzzy successor for a different old id, stamp `replaces_moneytor_id`.
  // Done before the delete so that even if step 5/6 fails we don't lose data.
  const CHUNK_SIZE = 100;
  for (let i = 0; i < fresh.length; i += CHUNK_SIZE) {
    const chunk = fresh.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((tx) => {
        const replacesId = freshToOld.get(tx.id);
        // If a fresh row's id equals the old id (no fuzzy switch needed), we
        // don't need a self-reference.
        const replaces = replacesId && replacesId !== tx.id ? replacesId : null;
        return prisma.moneytorTransaction.upsert({
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
            replacesMoneytorId: replaces,
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
            replacesMoneytorId: replaces,
            syncedAt: new Date(),
          },
        });
      })
    );
  }

  // 5. Re-link / delete budget_transactions linked to in-range old moneytor ids.
  //   - Old id had a fresh successor → repoint budget_transaction.moneytorId.
  //     The budget row is preserved as-is, with all user edits intact.
  //   - Old id had no successor → delete the budget row (Moneytor no longer
  //     reports this transaction).
  const inRangeOldIds = existingMoneytor.map((e) => e.id);
  let deletedBudget = 0;
  let relinked = 0;
  if (inRangeOldIds.length > 0) {
    const linkedBudget = await prisma.budgetTransaction.findMany({
      where: { householdId, moneytorId: { in: inRangeOldIds } },
      select: { id: true, moneytorId: true },
    });

    // Invert the freshToOld map for lookup by oldId.
    const oldToFresh = new Map<string, string>();
    for (const [freshId, oldId] of freshToOld) oldToFresh.set(oldId, freshId);

    const toRelink = linkedBudget.filter((b) => b.moneytorId && oldToFresh.has(b.moneytorId));
    const toDelete = linkedBudget.filter((b) => !b.moneytorId || !oldToFresh.has(b.moneytorId));

    // Re-link via per-row updates (Neon poolQuery + updateMany don't mix —
    // see CLAUDE.md).
    const BATCH_SIZE = 5;
    for (let i = 0; i < toRelink.length; i += BATCH_SIZE) {
      const batch = toRelink.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((b) =>
          prisma.budgetTransaction.update({
            where: { id: b.id },
            data: { moneytorId: oldToFresh.get(b.moneytorId!) ?? null },
          })
        )
      );
    }
    relinked = toRelink.length;

    if (toDelete.length > 0) {
      // Before deleting, log the drops so the user can review (or recover) via
      // the Labs tab. Without this audit trail a re-sync silently removes user-
      // visible budget rows whenever Moneytor stops returning them.
      const toDeleteIds = toDelete.map((b) => b.id);
      const dropRows = await prisma.budgetTransaction.findMany({
        where: { id: { in: toDeleteIds } },
        select: {
          id: true,
          moneytorId: true,
          transactionDate: true,
          amountIls: true,
          payee: { select: { name: true } },
          notes: true,
        },
      });
      if (dropRows.length > 0) {
        await prisma.$transaction(
          dropRows.map((b) =>
            prisma.moneytorDropLog.create({
              data: {
                householdId,
                originalMoneytorId: b.moneytorId,
                budgetTransactionId: b.id,
                transactionDate: b.transactionDate,
                amountIls: b.amountIls,
                payeeName: b.payee?.name ?? null,
                description: b.notes,
                reason: 'no_successor_in_moneytor',
              },
            })
          )
        );
      }

      const deletedBudgetRes = await prisma.budgetTransaction.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
      deletedBudget = deletedBudgetRes.count;
    }
  }

  // 6. Delete the old moneytor rows that were NOT kept by a fresh upsert and
  // whose key wasn't fuzzy-matched. Anything still referenced by a re-linked
  // budget_transaction has been pointed to the fresh row already.
  // We delete every old id that isn't also a fresh id — fresh ones reusing the
  // same id were already overwritten by the upsert in step 4.
  const freshIds = new Set(fresh.map((f) => f.id));
  const oldIdsToDelete = inRangeOldIds.filter((id) => !freshIds.has(id));
  let deletedMoneytor = 0;
  if (oldIdsToDelete.length > 0) {
    const deletedMoneytorRes = await prisma.moneytorTransaction.deleteMany({
      where: { householdId, id: { in: oldIdsToDelete } },
    });
    deletedMoneytor = deletedMoneytorRes.count;
  }

  // 7. Promote any fresh rows that aren't yet linked to a budget_transaction.
  // Fresh rows that took over an old id via upsert already had a link (no
  // promotion needed). Fuzzy-matched rows were re-linked in step 5. The rest
  // are new transactions for which we run the normal importTransactions path.
  const freshMoneytorRows = await prisma.moneytorTransaction.findMany({
    where: { householdId, transactionDate: { gte: fromDate, lte: toDate } },
    orderBy: { transactionDate: 'asc' },
  });
  const alreadyLinked = await prisma.budgetTransaction.findMany({
    where: { householdId, moneytorId: { in: freshMoneytorRows.map((m) => m.id) } },
    select: { moneytorId: true },
  });
  const linkedSet = new Set(alreadyLinked.map((b) => b.moneytorId).filter((x): x is string => !!x));
  const unpromoted = freshMoneytorRows.filter((m) => !linkedSet.has(m.id));

  let budgetCreated = 0;
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
  }

  // Edits "preserved" in the new model = the count of budget rows we re-linked
  // (those still carry the user's category/notes/tags). Same number reported
  // to the UI for continuity.
  const editsPreserved = relinked;
  // matchedOldIds is unused at runtime but kept readable in the summary —
  // surface as deletedMoneytor delta for now.
  void matchedOldIds;

  return {
    householdId,
    from,
    to,
    deletedMoneytor,
    deletedBudget,
    fetched: fresh.length,
    upserted: fresh.length,
    budgetCreated,
    editsPreserved,
    syncedAt: new Date().toISOString(),
  };
}
