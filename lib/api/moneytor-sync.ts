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

  return {
    householdId,
    fetched: transactions.length,
    upserted: transactions.length,
    stockAccounts: shareAssets.length,
    stocksUpserted,
    snapshotsUpserted,
    accountsUpserted,
    accountSnapshotsUpserted,
    pensionFundsUpserted,
    pensionSnapshotsUpserted,
    budgetCreated,
    budgetSkipped,
    latestDate: newLatest?.transactionDate.toISOString().split('T')[0] ?? null,
    syncedAt: new Date().toISOString(),
  };
}
