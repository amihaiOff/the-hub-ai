import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  fetchMoneytorTransactions,
  fetchMoneytorAssets,
  type MoneytorAsset,
  type MoneytorBankAsset,
  type MoneytorDebtAsset,
  type MoneytorPensionAsset,
  type MoneytorRealEstateAsset,
  type MoneytorShareAsset,
} from './moneytor';
import { importTransactions } from '@/lib/utils/import-transactions';
import type { ImportTransactionInput } from '@/lib/validations/budget';
import { mapMoneytorTypeToPaymentMethod } from '@/lib/utils/moneytor-mapping';
import {
  computeAccountStableKey,
  computePensionStableKey,
  computeRealEstateStableKey,
} from '@/lib/moneytor/stable-key';
import {
  reconcile,
  decideMissingActions,
  logRename,
  logHardDelete,
  type ReconcilerEntity,
} from '@/lib/moneytor/reconciler';

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
  realEstateUpserted: number;
  realEstateSnapshotsUpserted: number;
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
            extraInfo: tx.extra_info ?? null,
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
            extraInfo: tx.extra_info ?? null,
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
  const realEstateAssets = allAssets.filter(
    (a): a is MoneytorAsset & MoneytorRealEstateAsset => a.form === 'realestate'
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
        // Seed notes from Moneytor's extra_info — payee/counterparty metadata
        // on Bit P2P + customer notes on other transfers. Only stamped when
        // this budget row is first created; user edits later on won't be
        // overwritten (importTransactions skips duplicates).
        notes: mt.extraInfo ?? null,
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

  // ----- Bank + debt accounts (via shared reconciler) -----
  // Reconciler-driven so re-linking a bank (which reissues Moneytor's
  // productId) no longer produces duplicates: we match incoming rows to
  // existing ones by stableKey (openfinanceAssetId) or userCanonicalId
  // first, and only fall back to productId as a last resort.
  //
  // Debts are stored with a negative balance so downstream charts get
  // the correct sign without per-row logic.
  let accountsUpserted = 0;
  let accountSnapshotsUpserted = 0;

  // Build per-asset derived fields once so we can pass a compact record
  // to both the reconciler and the write phase.
  const now = new Date();
  const accountAssets = [...bankAssets, ...debtAssets];
  const accountRows = accountAssets.map((asset) => {
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
      const totalRemainder = routes.reduce((s, r) => s + Number(r.remainder ?? 0), 0);
      if (totalRemainder > 0) {
        interestRate =
          routes.reduce((s, r) => s + Number(r.interest ?? 0) * Number(r.remainder ?? 0), 0) /
          totalRemainder;
      }
      monthlyPayment = routes.reduce((s, r) => s + Number(r.monthlyRepayment ?? 0), 0) || null;
    }

    return {
      asset,
      productId,
      stableKey: computeAccountStableKey(asset),
      name: asset.name,
      form: asset.form,
      institution,
      subtype,
      accountNumber,
      currency,
      balanceInBase,
      interestRate,
      maturityDate,
      monthlyPayment,
    };
  });

  await runAccountReconciliation(householdId, accountRows, snapshotDate, now);
  accountsUpserted = accountRows.length;
  accountSnapshotsUpserted = accountRows.length;

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
    const accountNumber = asset.accountNumber != null ? String(asset.accountNumber) : null;
    const balanceInBase = Number(asset.balanceInBaseCurrency ?? asset.amount ?? 0);
    const amount = Number(asset.amount ?? balanceInBase);
    const currency = asset.currency?.value || 'ILS';
    const fundOpening = asset.fundOpeningDate
      ? new Date(`${asset.fundOpeningDate.slice(0, 10)}T00:00:00Z`)
      : null;
    const taarichLeyda = asset.taarichLeyda
      ? new Date(`${asset.taarichLeyda.slice(0, 10)}T00:00:00Z`)
      : null;
    // Populate stableKey on write-through so future syncs (or a possible
    // reconciler upgrade) can match on it even if Moneytor swaps productIds.
    const stableKey = computePensionStableKey({ institution, accountNumber, routeName });

    await prisma.moneytorPensionFund.upsert({
      where: {
        householdId_productId_routeName: { householdId, productId, routeName },
      },
      create: {
        productId,
        routeName,
        stableKey,
        routeCode: asset.investmentDistribution?.[0]?.routeCode ?? null,
        name: asset.name,
        institution,
        productType,
        sugKupa: asset.sugKupa != null && asset.sugKupa !== '' ? Number(asset.sugKupa) : null,
        sugKerenPensia: asset.sugKerenPensia ?? null,
        accountNumber,
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
        stableKey,
        routeCode: asset.investmentDistribution?.[0]?.routeCode ?? null,
        name: asset.name,
        institution,
        productType,
        sugKupa: asset.sugKupa != null && asset.sugKupa !== '' ? Number(asset.sugKupa) : null,
        sugKerenPensia: asset.sugKerenPensia ?? null,
        accountNumber,
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

  // ----- Real-estate properties + monthly snapshot -----
  // Monthly snapshot cadence (same as pension) because property values
  // don't change daily — keying on month-start lets repeated syncs in the
  // same month overwrite, so the snapshot reflects the latest observed value.
  let realEstateUpserted = 0;
  let realEstateSnapshotsUpserted = 0;
  const realEstateMonthStart = monthStart; // already computed for pension

  // Numeric fields can arrive as string or number — coerce safely.
  const toNum = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  for (const asset of realEstateAssets) {
    const productId = String(asset.productId ?? asset.id);
    const currentValue = toNum(asset.value ?? asset.balanceInBaseCurrency) ?? 0;
    const balanceInBase = toNum(asset.balanceInBaseCurrency ?? asset.value) ?? 0;
    const currency = asset.currency?.value || 'ILS';
    const ownership = toNum(asset.ownership);
    const purchasePrice = toNum(asset.purchasePrice);
    const purchaseDate = asset.purchaseDate
      ? new Date(`${asset.purchaseDate.slice(0, 10)}T00:00:00Z`)
      : null;
    const purchaseExpenses = toNum(asset.purchaseExpenses);

    const country = asset.country?.value ?? null;
    const houseNumber = asset.houseNumber != null ? String(asset.houseNumber) : null;
    const propertyType = asset.propertyType?.value ?? null;
    const propertyCondition = asset.propertyCondition?.value ?? null;
    const measurementUnit = asset.measurementUnit?.value ?? null;
    const builtArea = toNum(asset.builtArea);
    const gardenBalconySize = toNum(asset.gardenBalconySize);
    const apartmentFloors = asset.apartmentFloors != null ? String(asset.apartmentFloors) : null;
    const rent = toNum(asset.rent);
    const rentSuggestion = toNum(asset.rentSuggestion);
    const rentType = asset.rentType?.value ?? null;
    const incomeFrequency = asset.incomeFrequency?.value ?? null;
    const saleCommission = toNum(asset.saleCommission);
    const profitTax = toNum(asset.profitTax);
    const generalSellingExpenses = toNum(asset.generalSellingExpenses);
    const legalExpenses = toNum(asset.legalExpenses);
    // The API sometimes returns `{ value: '[object Object]' }` for linkedMortgage
    // — that's a Moneytor serialization quirk. Store the raw value string anyway
    // so we can revisit later if they fix it.
    const linkedMortgageRef = asset.linkedMortgage?.value ?? null;
    const stableKey = computeRealEstateStableKey(asset.address ?? null);

    await prisma.moneytorRealEstate.upsert({
      where: { householdId_productId: { householdId, productId } },
      create: {
        productId,
        stableKey,
        name: asset.name,
        currentValue,
        balanceInBase,
        currency,
        ownership,
        purchasePrice,
        purchaseDate,
        purchaseExpenses,
        country,
        city: asset.city ?? null,
        street: asset.street ?? null,
        houseNumber,
        address: asset.address ?? null,
        latitude: toNum(asset.latitude),
        longitude: toNum(asset.longitude),
        propertyType,
        propertyCondition,
        measurementUnit,
        builtArea,
        gardenBalconySize,
        bedrooms: asset.bedrooms ?? null,
        floor: asset.floor ?? null,
        apartmentFloors,
        rent,
        rentSuggestion,
        rentType,
        incomeFrequency,
        saleCommission,
        profitTax,
        generalSellingExpenses,
        legalExpenses,
        linkedMortgageRef,
        rawData: asset as unknown as Prisma.InputJsonValue,
        householdId,
      },
      update: {
        stableKey,
        name: asset.name,
        currentValue,
        balanceInBase,
        currency,
        ownership,
        purchasePrice,
        purchaseDate,
        purchaseExpenses,
        country,
        city: asset.city ?? null,
        street: asset.street ?? null,
        houseNumber,
        address: asset.address ?? null,
        latitude: toNum(asset.latitude),
        longitude: toNum(asset.longitude),
        propertyType,
        propertyCondition,
        measurementUnit,
        builtArea,
        gardenBalconySize,
        bedrooms: asset.bedrooms ?? null,
        floor: asset.floor ?? null,
        apartmentFloors,
        rent,
        rentSuggestion,
        rentType,
        incomeFrequency,
        saleCommission,
        profitTax,
        generalSellingExpenses,
        legalExpenses,
        linkedMortgageRef,
        rawData: asset as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
    realEstateUpserted++;

    await prisma.moneytorRealEstateSnapshot.upsert({
      where: {
        householdId_snapshotMonth_productId: {
          householdId,
          snapshotMonth: realEstateMonthStart,
          productId,
        },
      },
      create: {
        snapshotMonth: realEstateMonthStart,
        productId,
        name: asset.name,
        currentValue,
        balanceInBase,
        currency,
        householdId,
      },
      update: {
        name: asset.name,
        currentValue,
        balanceInBase,
        currency,
      },
    });
    realEstateSnapshotsUpserted++;
  }

  // Remove properties that Moneytor no longer reports (e.g. user deleted one)
  if (
    realEstateAssets.length > 0 ||
    (await prisma.moneytorRealEstate.count({ where: { householdId } })) > 0
  ) {
    const seenIds = new Set(realEstateAssets.map((a) => String(a.productId ?? a.id)));
    const allRows = await prisma.moneytorRealEstate.findMany({
      where: { householdId },
      select: { id: true, productId: true },
    });
    const toDelete = allRows.filter((r) => !seenIds.has(r.productId)).map((r) => r.id);
    if (toDelete.length > 0) {
      await prisma.moneytorRealEstate.deleteMany({ where: { id: { in: toDelete } } });
    }
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
    realEstateUpserted,
    realEstateSnapshotsUpserted,
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
  const existingIds = new Set(existingMoneytor.map((e) => e.id));
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
    // A fresh row whose id already existed is a same-id survivor (handled by the
    // freshIds preservation path below). It must NOT consume a fuzzy-match queue
    // slot — otherwise, when duplicate keys exist and Moneytor collapses them,
    // another row could be re-pointed to this id and double-count.
    if (existingIds.has(f.id)) continue;
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
            extraInfo: tx.extra_info ?? null,
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
            extraInfo: tx.extra_info ?? null,
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

  // Fresh Moneytor ids that survived this resync (upserted in step 4). A budget
  // row still linked to one of these is the SAME transaction — Moneytor merely
  // corrected its fields (a settling card charge changes date/amount/description
  // while keeping its id). Such rows must be preserved with the user's category,
  // never deleted-and-recreated as uncategorized.
  // NOTE: this preservation relies on Moneytor ids being stable natural keys —
  // an id is never reused for a genuinely different transaction. (If it were,
  // we'd attach the old category to the wrong row.)
  const freshIds = new Set(fresh.map((f) => f.id));
  const freshById = new Map(fresh.map((f) => [f.id, f]));

  // 5. Re-link / delete budget_transactions linked to in-range old moneytor ids.
  //   - Old id still present in fresh (same id, maybe corrected fields) → keep
  //     the budget row as-is; it stays linked and user edits are preserved.
  //   - Old id had a fresh successor (id changed) → repoint moneytorId.
  //   - Old id gone with no successor → delete the budget row (Moneytor no
  //     longer reports this transaction).
  const inRangeOldIds = existingMoneytor.map((e) => e.id);
  let deletedBudget = 0;
  let relinked = 0;
  let refreshed = 0;
  let unlinked = 0;
  let adopted = 0;
  // Ids unlinked in step 5; if one is re-adopted in step 7 it must not be
  // double-counted in editsPreserved.
  const unlinkedIds = new Set<string>();
  let adoptedFromUnlinked = 0;
  if (inRangeOldIds.length > 0) {
    const linkedBudget = await prisma.budgetTransaction.findMany({
      where: { householdId, moneytorId: { in: inRangeOldIds } },
      select: { id: true, moneytorId: true, categoryId: true, _count: { select: { tags: true } } },
    });
    // A row carries user intent worth preserving if it's categorized or tagged.
    const hasEdits = (b: { categoryId: string | null; _count: { tags: number } }) =>
      b.categoryId !== null || b._count.tags > 0;

    // Invert the freshToOld map for lookup by oldId.
    const oldToFresh = new Map<string, string>();
    for (const [freshId, oldId] of freshToOld) oldToFresh.set(oldId, freshId);

    // Same-id survivors: keep the row (and the user's category/notes/tags/payee)
    // but refresh the denormalized financial fields, since Moneytor may have
    // corrected the amount/date in place (a pending charge settling).
    const toRefresh = linkedBudget.filter((b) => b.moneytorId && freshIds.has(b.moneytorId));
    // Changed-id rows with a fuzzy successor get re-pointed.
    const toRelink = linkedBudget.filter(
      (b) => b.moneytorId && !freshIds.has(b.moneytorId) && oldToFresh.has(b.moneytorId)
    );
    // No successor: an EDITED row is never destroyed — unlink it (keep it as a
    // manual transaction, category intact) so a later promote can re-adopt it by
    // content. Only un-edited auto-imported rows are deleted.
    const noSuccessor = linkedBudget.filter(
      (b) => b.moneytorId && !freshIds.has(b.moneytorId) && !oldToFresh.has(b.moneytorId)
    );
    const toUnlink = noSuccessor.filter(hasEdits);
    const toDelete = noSuccessor.filter((b) => !hasEdits(b));

    const BATCH_SIZE = 5;

    // Refresh financial fields on same-id survivors (preserve everything else).
    for (let i = 0; i < toRefresh.length; i += BATCH_SIZE) {
      const batch = toRefresh.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((b) => {
          const f = freshById.get(b.moneytorId!);
          if (!f) return Promise.resolve();
          const amount = Number(f.amount);
          return prisma.budgetTransaction.update({
            where: { id: b.id },
            data: {
              type: amount < 0 ? 'expense' : 'income',
              amountIls: Math.abs(amount),
              amountOriginal: Math.abs(amount),
              currency: f.currency,
              transactionDate: new Date(`${f.date}T00:00:00Z`),
            },
          });
        })
      );
    }
    refreshed = toRefresh.length;

    // Re-link via per-row updates (Neon poolQuery + updateMany don't mix —
    // see CLAUDE.md).
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

    // Unlink edited rows whose Moneytor source vanished — they live on as manual
    // transactions (category preserved) and become adoption candidates below.
    for (let i = 0; i < toUnlink.length; i += BATCH_SIZE) {
      const batch = toUnlink.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((b) =>
          prisma.budgetTransaction.update({
            where: { id: b.id },
            data: { moneytorId: null },
          })
        )
      );
    }
    for (const b of toUnlink) unlinkedIds.add(b.id);
    unlinked = toUnlink.length;

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
  // same id were already overwritten by the upsert in step 4. (`freshIds`
  // computed above, before step 5.)
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
  let unpromoted = freshMoneytorRows.filter((m) => !linkedSet.has(m.id));

  // ── Adoption: re-attach a fresh row to an existing edited-but-unlinked budget
  // row by CONTENT (account + amount + near date) rather than by Moneytor id, so
  // a categorized transaction survives even when Moneytor reissues its id. This
  // is what makes preservation independent of the id. Matched rows adopt the
  // fresh id + refreshed amount/date and keep their category/notes/tags/payee.
  const ADOPT_WINDOW_DAYS = 5;
  const adoptWindowMs = ADOPT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (unpromoted.length > 0) {
    const candidates = await prisma.budgetTransaction.findMany({
      where: {
        householdId,
        moneytorId: null,
        isDeleted: false,
        transactionDate: {
          gte: new Date(fromDate.getTime() - adoptWindowMs),
          lte: new Date(toDate.getTime() + adoptWindowMs),
        },
        OR: [{ categoryId: { not: null } }, { tags: { some: {} } }],
      },
      select: {
        id: true,
        type: true,
        paymentIdentifier: true,
        amountIls: true,
        transactionDate: true,
      },
    });
    // Index candidates by (paymentIdentifier|type|amount) → queue of {id, date}.
    // The TYPE (sign) is part of the key so a fresh expense can never adopt an
    // equal-magnitude income row (refund/charge pairs on the same account within
    // the window) — that would flip the type and destroy a categorized income.
    const candidateIndex = new Map<string, { id: string; date: Date }[]>();
    for (const c of candidates) {
      const key = `${c.paymentIdentifier ?? ''}|${c.type}|${Number(c.amountIls).toFixed(2)}`;
      const arr = candidateIndex.get(key) ?? [];
      arr.push({ id: c.id, date: c.transactionDate });
      candidateIndex.set(key, arr);
    }
    const consumed = new Set<string>();
    const stillUnpromoted: typeof unpromoted = [];
    for (const mt of unpromoted) {
      const amount = Number(mt.amount);
      const freshType = amount < 0 ? 'expense' : 'income';
      const key = `${mt.accountId.slice(-12)}|${freshType}|${Math.abs(amount).toFixed(2)}`;
      const pool = (candidateIndex.get(key) ?? []).filter((c) => !consumed.has(c.id));
      // Nearest within the date window wins.
      let best: { id: string; date: Date } | null = null;
      let bestDelta = Infinity;
      for (const c of pool) {
        const delta = Math.abs(c.date.getTime() - mt.transactionDate.getTime());
        if (delta <= adoptWindowMs && delta < bestDelta) {
          best = c;
          bestDelta = delta;
        }
      }
      if (best) {
        consumed.add(best.id);
        if (unlinkedIds.has(best.id)) adoptedFromUnlinked++;
        await prisma.budgetTransaction.update({
          where: { id: best.id },
          data: {
            moneytorId: mt.id,
            type: freshType,
            amountIls: Math.abs(amount),
            amountOriginal: Math.abs(amount),
            currency: mt.currency,
            transactionDate: mt.transactionDate,
          },
        });
        adopted++;
      } else {
        stillUnpromoted.push(mt);
      }
    }
    unpromoted = stillUnpromoted;
  }

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
        // Seed notes from Moneytor's extra_info — payee/counterparty metadata
        // on Bit P2P + customer notes on other transfers. Only stamped when
        // this budget row is first created; user edits later on won't be
        // overwritten (importTransactions skips duplicates).
        notes: mt.extraInfo ?? null,
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
  // (those still carry the user's category/notes/tags): re-linked (changed id) +
  // same-id survivors refreshed in place + content-adopted rows + edited rows
  // kept as manual (unlinked) rather than deleted.
  // Subtract rows counted in both `unlinked` (step 5) and `adopted` (step 7)
  // during the same run so a single preserved row isn't tallied twice.
  const editsPreserved = relinked + refreshed + adopted + unlinked - adoptedFromUnlinked;

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

/** Source of a sync attempt — used to filter the Sync Log UI. */
export type MoneytorSyncSource = 'manual' | 'cron';

/**
 * Wraps `syncMoneytorForHousehold` with a persistent log entry. Every
 * attempt (success or failure) writes a row to `moneytor_sync_logs` so the
 * Labs → Sync Log page can surface a per-household audit trail.
 *
 * Re-throws the original error so callers can keep their error-handling
 * paths (Moneytor API errors, etc.).
 */
export async function syncMoneytorForHouseholdAndLog(
  householdId: string,
  source: MoneytorSyncSource
): Promise<MoneytorSyncSummary> {
  const startedAt = new Date();
  try {
    const summary = await syncMoneytorForHousehold(householdId);
    const completedAt = new Date();
    try {
      await prisma.moneytorSyncLog.create({
        data: {
          householdId,
          source,
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          success: true,
          results: summary as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (logErr) {
      // Logging is best-effort — don't fail the sync because logging failed.
      console.error('Failed to write moneytor_sync_log row:', logErr);
    }
    return summary;
  } catch (err) {
    const completedAt = new Date();
    try {
      await prisma.moneytorSyncLog.create({
        data: {
          householdId,
          source,
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          success: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    } catch (logErr) {
      console.error('Failed to write moneytor_sync_log row (after failure):', logErr);
    }
    throw err;
  }
}

// ─── Reconciler drivers per entity type ───────────────────────────────
//
// Each of these is the write side of the reconciler for a specific
// entity. Reads the existing rows, runs the pure `reconcile()` pass,
// then does the DB writes (upserts + rename/delete logs) needed to
// bring the DB in line with what Moneytor just returned.
//
// Kept in this file (rather than lib/moneytor/) because they're tightly
// coupled to the sync flow's derived record shape.

type AccountReconRow = {
  asset: MoneytorBankAsset | MoneytorDebtAsset;
  productId: string;
  stableKey: string | null;
  name: string;
  form: string;
  institution: string | null;
  subtype: string | null;
  accountNumber: string | null;
  currency: string;
  balanceInBase: number;
  interestRate: number | null;
  maturityDate: Date | null;
  monthlyPayment: number | null;
};

async function runAccountReconciliation(
  householdId: string,
  incoming: AccountReconRow[],
  snapshotDate: Date,
  now: Date
): Promise<void> {
  const existing = await prisma.moneytorAccount.findMany({
    where: { householdId },
    select: {
      id: true,
      productId: true,
      stableKey: true,
      userCanonicalId: true,
      name: true,
      missingSince: true,
    },
  });

  const outcome = reconcile(
    incoming.map((r) => ({ productId: r.productId, stableKey: r.stableKey, name: r.name })),
    existing.map((e) => ({
      id: e.id,
      productId: e.productId,
      stableKey: e.stableKey,
      userCanonicalId: e.userCanonicalId,
      name: e.name,
    })),
    now
  );

  // A stableKey / userCanonicalId match can move a productId from one
  // row to another (Moneytor re-linked and reissued the id). Two ways
  // this triggers the (householdId, productId) unique index:
  //   1. Two matched rows swap productIds — before we can UPDATE the
  //      first, the second still holds the target productId.
  //   2. A matched row wants a productId currently held by an *unmatched*
  //      existing row — the matcher picked a stableKey winner and left
  //      the productId owner orphaned.
  //
  // Fix in two prep passes before the main loop:
  //   a) Delete orphan-collisions (case 2). These rows lost their
  //      identity to a stableKey match and there's no valid path to
  //      keep them, so we log + hard-delete now.
  //   b) Temp-prefix every matched row whose productId is about to
  //      change (case 1). This vacates the old productId so no
  //      subsequent UPDATE can collide.
  const matchedPairs = outcome.matches
    .map((m, i) => (m.existing ? { existing: m.existing, row: incoming[i] } : null))
    .filter(
      (
        p
      ): p is {
        existing: NonNullable<(typeof outcome.matches)[number]['existing']>;
        row: (typeof incoming)[number];
      } => p != null
    );

  const matchedExistingIds = new Set(matchedPairs.map((p) => p.existing.id));
  const targetProductIds = new Set(matchedPairs.map((p) => p.row.productId));

  const orphanCollisions = existing.filter(
    (e) => !matchedExistingIds.has(e.id) && targetProductIds.has(e.productId)
  );
  for (const o of orphanCollisions) {
    await logHardDelete(prisma, {
      householdId,
      subjectType: 'moneytor_account',
      subjectId: o.id,
      name: o.name,
    });
    await prisma.moneytorAccount.delete({ where: { id: o.id } });
  }

  for (const p of matchedPairs) {
    if (p.existing.productId !== p.row.productId) {
      await prisma.moneytorAccount.update({
        where: { id: p.existing.id },
        // Guaranteed unique per (household, productId) because it
        // embeds the row's cuid. The real productId is written in the
        // main loop below.
        data: { productId: `__reconcile_${p.existing.id}` },
      });
    }
  }

  // Match incoming to existing by index (reconcile preserves the input order).
  for (let i = 0; i < incoming.length; i++) {
    const row = incoming[i];
    const match = outcome.matches[i];

    if (match.existing) {
      // Update in place — refresh productId to whatever Moneytor just
      // sent, and clear any missingSince from a prior sync where the row
      // was absent.
      await prisma.moneytorAccount.update({
        where: { id: match.existing.id },
        data: {
          productId: row.productId,
          stableKey: row.stableKey,
          missingSince: null,
          form: row.form,
          name: row.name,
          institution: row.institution,
          subtype: row.subtype,
          accountNumber: row.accountNumber,
          currency: row.currency,
          balanceInBase: row.balanceInBase,
          interestRate: row.interestRate,
          maturityDate: row.maturityDate,
          monthlyPayment: row.monthlyPayment,
          rawData: row.asset as unknown as Prisma.InputJsonValue,
          syncedAt: now,
        },
      });
    } else {
      await prisma.moneytorAccount.create({
        data: {
          productId: row.productId,
          stableKey: row.stableKey,
          form: row.form,
          name: row.name,
          institution: row.institution,
          subtype: row.subtype,
          accountNumber: row.accountNumber,
          currency: row.currency,
          balanceInBase: row.balanceInBase,
          interestRate: row.interestRate,
          maturityDate: row.maturityDate,
          monthlyPayment: row.monthlyPayment,
          rawData: row.asset as unknown as Prisma.InputJsonValue,
          householdId,
        },
      });
    }

    // Snapshot upsert keyed on (household, snapshotDate, productId)
    // still uses the new productId — historical snapshots may reference
    // the old one but that's fine; we accept that discontinuity for
    // now since the account row itself was preserved through the rename.
    await prisma.moneytorAccountSnapshot.upsert({
      where: {
        householdId_snapshotDate_productId: {
          householdId,
          snapshotDate,
          productId: row.productId,
        },
      },
      create: {
        snapshotDate,
        productId: row.productId,
        form: row.form,
        name: row.name,
        balanceInBase: row.balanceInBase,
        currency: row.currency,
        householdId,
      },
      update: {
        form: row.form,
        name: row.name,
        balanceInBase: row.balanceInBase,
        currency: row.currency,
      },
    });
  }

  // Grace-period soft delete for rows Moneytor didn't return. Skip any
  // orphan-collisions we already hard-deleted above.
  const matchedIds = new Set(outcome.matches.filter((m) => m.existing).map((m) => m.existing!.id));
  const orphanIds = new Set(orphanCollisions.map((o) => o.id));
  const unmatched = existing
    .filter((e) => !matchedIds.has(e.id) && !orphanIds.has(e.id))
    .map((e) => ({
      id: e.id,
      productId: e.productId,
      stableKey: e.stableKey,
      userCanonicalId: e.userCanonicalId,
      name: e.name,
      missingSince: e.missingSince,
    }));
  const { toMarkMissing, toHardDelete } = decideMissingActions(unmatched, now);
  for (const row of toMarkMissing) {
    await prisma.moneytorAccount.update({
      where: { id: row.id },
      data: { missingSince: now },
    });
  }
  for (const row of toHardDelete) {
    await logHardDelete(prisma, {
      householdId,
      subjectType: 'moneytor_account',
      subjectId: row.id,
      name: row.name,
    });
    await prisma.moneytorAccount.delete({ where: { id: row.id } });
  }
  // Rows that just re-appeared get their missingSince cleared. Cheap
  // no-op when it was already null.
  for (const r of outcome.matches) {
    if (r.existing) {
      // Update was already done above with missingSince: null.
    }
  }

  // Emit rename events.
  for (const ev of outcome.renameEvents) {
    await logRename(prisma, {
      householdId,
      subjectType: 'moneytor_account',
      subjectId: ev.existing.id,
      oldName: ev.oldName,
      newName: ev.newName,
    });
  }
}
